#include <hwy/aligned_allocator.h>
#include <atomic>
#include <hwy/highway.h>

/*
* This is a utility class for dealing with 'smoothing' of values via SIMD
* It can take N amount of values and perform the smoothing of them in one go.
* Each value is stored in a separate, meaning that one operation is needed to update them.
* The next part of taking the updates values and putting them into the correct value is a little more expensive...
*/

HWY_BEFORE_NAMESPACE();
namespace hwy
{
    namespace HWY_NAMESPACE
    {
        template<typename T, int COUNT>
        class HighwayValueSmoother
        {
        private:

            //Round COUNT up to the next power of 2 - since CappedTag requires only powers of 2.
            static constexpr int _laneCount()
            {
                int v = COUNT - 1;
                v |= v >> 1;
                v |= v >> 2;
                v |= v >> 4;
                v |= v >> 8;
                v |= v >> 16;
                v++;
                return v;
            }

            typedef hwy::HWY_NAMESPACE::VFromD<hwy::HWY_NAMESPACE::CappedTag<T, _laneCount()  >> VecType;
            typedef hwy::HWY_NAMESPACE::MFromD<hwy::HWY_NAMESPACE::CappedTag<T, _laneCount()  >> VecMaskType;

        public:
            typedef VecType ValueType;
            typedef VecMaskType MaskType;

            static constexpr size_t ValueCount()
            {
                return COUNT;
            }


            HighwayValueSmoother()
            {
                constexpr size_t allocsz = AllocSize();

                if(!targetVals_)
                    targetVals_ = hwy::AllocateAligned<float>(allocsz);

                if(!currentVals_)
                    currentVals_ = hwy::AllocateAligned<float>(allocsz);
            }

            HighwayValueSmoother(T smoothVal)
            {
                constexpr size_t allocsz = AllocSize();

                if(!targetVals_)
                    targetVals_ = hwy::AllocateAligned<float>(allocsz);

                if(!currentVals_)
                    currentVals_ = hwy::AllocateAligned<float>(allocsz);

                configure(smoothVal);
            }

            ~HighwayValueSmoother() = default;

            template<typename... ATOMIC>
            void initialise(ATOMIC... args)
            {
                namespace HWY = hwy::HWY_NAMESPACE;
                InitFunc<ATOMIC...>::initTargets(targets_, args...);
            }


            HWY_ATTR HWY_INLINE void SetSmooth(T smoothVal)
            {
                configure(smoothVal);
            }

            HWY_ATTR HWY_INLINE void UpdateTargetValues()
            {
                namespace HWY = hwy::HWY_NAMESPACE;
                const HWY::DFromV<VecType> _vectype;

                VecType val = HWY::Zero(_vectype);
                VecMaskType mask = HWY::Not(HWY::MaskFalse(_vectype));
                constexpr size_t allocsz = AllocSize();

                for(size_t x=0; x < COUNT; ++x)
                {
                    T curval = targets_[x]->load(std::memory_order_acquire);

                    val = HWY::MaskedSetOr(val, mask, curval);
                    mask = HWY::SlideMask1Up(_vectype, mask);
                }

                frozen_ = false;
                HWY::Store(val, _vectype, targetVals_.get());
            }

            HWY_ATTR HWY_INLINE void PrepareCurrentValues()
            {
                namespace HWY = hwy::HWY_NAMESPACE;
                const HWY::DFromV<VecType> _vectype;

                VecType val = HWY::Zero(_vectype);
                VecMaskType mask = HWY::Not(HWY::MaskFalse(_vectype));
                constexpr size_t allocsz = AllocSize();

                for(size_t x=0; x < COUNT; ++x)
                {
                    T curval = targets_[x]->load(std::memory_order_acquire);

                    val = HWY::MaskedSetOr(val, mask, curval);
                    mask = HWY::SlideMask1Up(_vectype, mask);
                }

                frozen_ = false;
                HWY::Store(val, _vectype, currentVals_.get());
            }

            void ZeroCurrentValues()
            {
                constexpr size_t allocsz = AllocSize();
                if(currentVals_)
                    memset(currentVals_.get(),0, allocsz * sizeof(float));

                frozen_ = false;
            }

            void ZeroTargetValues()
            {
                constexpr size_t allocsz = AllocSize();
                if(targetVals_)
                    memset(targetVals_.get(),0, allocsz * sizeof(float));

                frozen_ = false;
            }

            HWY_ATTR HWY_INLINE void Start(VecType & target, VecType & current, VecType & smooth  ) const
            {
                namespace HWY = hwy::HWY_NAMESPACE;
                const HWY::DFromV<VecType> _vectype;

                target = HWY::Load(_vectype, targetVals_.get());
                current = HWY::Load(_vectype, currentVals_.get());
                smooth = HWY::Load(_vectype, smooth_.get());
            }

            HWY_ATTR HWY_INLINE void End(const VecType & current) const
            {
                namespace HWY = hwy::HWY_NAMESPACE;
                const HWY::DFromV<VecType> _vectype;

                HWY::Store(current, _vectype, currentVals_.get());
            }

            template<typename OT, typename... OUT>
            HWY_ATTR HWY_INLINE void Run(const size_t numTimes, const VecType & smooth, const VecType & target, VecType & current, OT & out1,  OUT&... output)
            {
                namespace HWY = hwy::HWY_NAMESPACE;
                const HWY::DFromV<VecType> _vectype; _vectype;
                const HWY::DFromV<OT> _outtype;
                using OutMaskType = hwy::HWY_NAMESPACE::MFromD< hwy::HWY_NAMESPACE::DFromV<OT>>;
                OutMaskType outMask = HWY::Not(HWY::MaskFalse(_outtype));
                
                if(frozen_)
                {
                    //Return the values from last time. No point in running the calculations if the outcome will not change
                    GetOutput(outMask, current, out1, output...);
                    return;
                }

                VecType newValues;
                const VecMaskType laneMask = HWY::FirstN(_vectype, static_cast<int>(COUNT));
                
                for(size_t lane=0; lane < numTimes; ++lane)
                {
                    newValues  =  HWY::MulAdd(HWY::Sub(target, current), smooth, current);

                    if((lane > 0) && HWY::AllFalse(_vectype, HWY::MaskedNe(laneMask, newValues, current)))
                    {
                        //If we're here, then the target and current state values are no longer moving.
                        //Thus, it is safe to skip the calculation for the remainder of the lanes - since
                        //the broadcast(s) would have set the remainder of the lanes already.
                        //It does mean the broadcasts need running at least once, so only skip if lane > 0
                        frozen_ = true;
                        break;
                    }

                    current = newValues;
                    GetOutput(outMask, newValues, out1, output...);
                    outMask = HWY::SlideMask1Up(_outtype, outMask);
                }
            }

            template<typename OT, typename... OUT>
            HWY_ATTR HWY_INLINE void Run_Reverse(const size_t numTimes, const VecType & smooth, const VecType & target, VecType & current, OT & out1,  OUT&... output)
            {
                namespace HWY = hwy::HWY_NAMESPACE;
                const HWY::DFromV<VecType> _vectype; _vectype;
                const HWY::DFromV<OT> _outtype;
                using OutMaskType = hwy::HWY_NAMESPACE::MFromD< hwy::HWY_NAMESPACE::DFromV<OT>>;
                OutMaskType outMask = HWY::Not(HWY::MaskFalse(_outtype));
                
                if(frozen_)
                {
                    //Return the values from last time. No point in running the calculations if the outcome will not change
                    GetOutput(outMask, current, out1, output...);
                    return;
                }

                VecType newValues;
                const VecMaskType laneMask = HWY::FirstN(_vectype, static_cast<int>(COUNT));
                
                for(size_t lane=0; lane < numTimes; ++lane)
                {
                    newValues  =  HWY::MulAdd(HWY::Sub(target, current), smooth, current);

                    if((lane > 0) && HWY::AllFalse(_vectype, HWY::MaskedNe(laneMask, newValues, current)))
                    {
                        //If we're here, then the target and current state values are no longer moving.
                        //Thus, it is safe to skip the calculation for the remainder of the lanes - since
                        //the broadcast(s) would have set the remainder of the lanes already.
                        //It does mean the broadcasts need running at least once, so only skip if lane > 0
                        frozen_ = true;
                        break;
                    }

                    current = newValues;
                    GetOutput(outMask, newValues, out1, output...);
                    outMask = HWY::SlideMask1Down(_outtype, outMask);
                }
            }

            template<typename OT, typename... OUT>
            HWY_ATTR HWY_INLINE void GetTargetValues(OT& out1, OUT&... output)
            {
                namespace HWY = hwy::HWY_NAMESPACE;
                const HWY::DFromV<VecType> _vectype;
                const HWY::DFromV<OT> _outtype;
                using OutMaskType = hwy::HWY_NAMESPACE::MFromD<hwy::HWY_NAMESPACE::DFromV<OT>>;
                VecType target = HWY::Load(_vectype, targetVals_.get());

                OutMaskType outMask = HWY::Not(HWY::MaskFalse(_outtype));
                GetOutput(outMask, target, out1, output...);
            }

        private:
            HWY_API constexpr size_t  AllocSize()
            {
                namespace HWY = hwy::HWY_NAMESPACE;
                const HWY::DFromV<VecType> _vectype;
                return HWY::MaxLanes(_vectype);
            }
            
            HWY_ATTR HWY_INLINE void configure(T smoothval)
            {
                namespace HWY = hwy::HWY_NAMESPACE;
                const HWY::DFromV<VecType> _vectype;
                constexpr size_t allocsz = AllocSize();

                if(!smooth_)
                    smooth_ = hwy::AllocateAligned<float>(allocsz);

                frozen_ = false;
                HWY::Store(HWY::Set(_vectype, smoothval), _vectype, smooth_.get());
            }

            template<typename... X>
            struct InitFunc
            {
                template<typename TT = T, typename A>
                HWY_API void SetTarget(const int idx, const std::atomic<TT> **  dest,  A & a)
                {
                    dest[idx] = a;
                }

                template<typename TT = T, typename A, typename... ARGS>
                HWY_API void SetTarget(const int idx, const std::atomic<TT> **  dest,  A & a, ARGS&... args )
                {
                    dest[idx] = a;
                    SetTarget(idx+1, dest, args...);
                }

                template<typename TT = T, int C=COUNT, std::size_t N = sizeof...(X)>
                HWY_API void initTargets(const std::atomic<TT> **  dest, X&... args, 
                                         typename std::enable_if< (C == N), void>::type * = nullptr)
                {
                    int x = 0; 
                    SetTarget(0, dest, args...);
                }
            };


            template<typename MT, typename VT, typename OT>
            HWY_API void GetOutput(const MT & mask, VT & state, OT & v1)
            {
                namespace HWY = hwy::HWY_NAMESPACE;
                const HWY::DFromV<OT> _outtype;

                //Cast to larger output type, and then broadcast
                OT x = HWY::ResizeBitCast(_outtype, state);
                v1 =  HWY::IfThenElse(mask, HWY::BroadcastLane<0>(x), v1);
            }

            template<typename MT, typename VT, typename OT>
            HWY_API void GetOutput(const MT & mask, VT & state, OT & v1, OT & v2)
            {
                namespace HWY = hwy::HWY_NAMESPACE;
                const HWY::DFromV<OT> _outtype;

                //Cast to larger output type, and then broadcast
                OT x = HWY::ResizeBitCast(_outtype, state);
                v1 =  HWY::IfThenElse(mask, HWY::BroadcastLane<0>(x), v1);
                v2 =  HWY::IfThenElse(mask, HWY::BroadcastLane<1>(x), v2);
            }

            template<typename MT, typename VT, typename OT>
            HWY_API void GetOutput(const MT & mask, VT & state, OT & v1, OT & v2, OT & v3)
            {
                namespace HWY = hwy::HWY_NAMESPACE;
                const HWY::DFromV<OT> _outtype;

                //Cast to larger output type, and then broadcast
                OT x = HWY::ResizeBitCast(_outtype, state);
                v1 =  HWY::IfThenElse(mask, HWY::BroadcastLane<0>(x), v1);
                v2 =  HWY::IfThenElse(mask, HWY::BroadcastLane<1>(x), v2);
                v3 =  HWY::IfThenElse(mask, HWY::BroadcastLane<2>(x), v3);
            }

            template<typename MT, typename VT, typename OT>
            HWY_API void GetOutput(const MT & mask, VT & state, OT & v1, OT & v2, OT & v3, OT & v4)
            {
                namespace HWY = hwy::HWY_NAMESPACE;
                const HWY::DFromV<OT> _outtype;

                //Cast to larger output type, and then broadcast
                OT x = HWY::ResizeBitCast(_outtype, state);
                v1 =  HWY::IfThenElse(mask, HWY::BroadcastLane<0>(x), v1);
                v2 =  HWY::IfThenElse(mask, HWY::BroadcastLane<1>(x), v2);
                v3 =  HWY::IfThenElse(mask, HWY::BroadcastLane<2>(x), v3);
                v4 =  HWY::IfThenElse(mask, HWY::BroadcastLane<3>(x), v4);
            }
            
            bool frozen_ = false; //when values will no logner change - there is no need to do anymore processing
            hwy::AlignedFreeUniquePtr<float[]> smooth_;
            hwy::AlignedFreeUniquePtr<float[]> targetVals_;
            hwy::AlignedFreeUniquePtr<float[]> currentVals_;
            const std::atomic<T> * targets_[COUNT];
        };
    }
}  // namespace hwy
HWY_AFTER_NAMESPACE();
