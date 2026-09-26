// Runs the original EQ8Node.cpp stereo path without editing the legacy checkout.
#include "dsp/core/nodes/EQ8Node.h"
#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <vector>
namespace juce {
this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode::
    this_will_fail_to_link_if_some_of_your_compile_units_are_built_in_release_mode() noexcept = default;
}
static void setParams(dsp_primitives::EQ8Node& node, const float* values) {
    for (int band = 0; band < 8; ++band) {
        const int id = band * 5;
        node.setBandEnabled(band + 1, values[id] >= 0.5f);
        node.setBandType(band + 1, static_cast<int>(values[id + 1]));
        node.setBandFreq(band + 1, values[id + 2]);
        node.setBandGain(band + 1, values[id + 3]);
        node.setBandQ(band + 1, values[id + 4]);
    }
    node.setOutput(values[40]); node.setMix(values[41]);
}
int main(int argc, char** argv) {
    if (argc != 91) { std::cerr << "usage: eq8-reference INPUT OUTPUT RATE BLOCK STEP FRAMES BEFORE[42] AFTER[42]\n"; return 2; }
    const double sampleRate=std::strtod(argv[3],nullptr);
    const int blockSize=std::atoi(argv[4]), stepFrame=std::atoi(argv[5]), frames=std::atoi(argv[6]);
    if (sampleRate<8000 || blockSize<1 || frames<1 || stepFrame<0 || stepFrame>frames || stepFrame%blockSize!=0) return 2;
    float before[42], after[42];
    for (int i=0;i<42;++i) { before[i]=std::strtof(argv[7+i],nullptr); after[i]=std::strtof(argv[49+i],nullptr); }
    std::vector<float> input(static_cast<size_t>(frames)*2), result(input.size());
    std::ifstream source(argv[1],std::ios::binary);
    source.read(reinterpret_cast<char*>(input.data()),static_cast<std::streamsize>(input.size()*sizeof(float)));
    if (!source || source.gcount()!=static_cast<std::streamsize>(input.size()*sizeof(float))) return 2;
    dsp_primitives::EQ8Node node; setParams(node,before); node.prepare(sampleRate,blockSize);
    for (int offset=0;offset<frames;offset+=blockSize) {
        if (offset==stepFrame) setParams(node,after);
        const int count=std::min(blockSize,frames-offset);
        std::vector<float> left(count),right(count),outLeft(count),outRight(count);
        for (int i=0;i<count;++i) { left[i]=input[(offset+i)*2]; right[i]=input[(offset+i)*2+1]; }
        const float* inPointers[]={left.data(),right.data()}; float* outPointers[]={outLeft.data(),outRight.data()};
        dsp_primitives::AudioBufferView in; in.channelData=inPointers; in.numChannels=2; in.numSamples=count;
        dsp_primitives::WritableAudioBufferView out; out.channelData=outPointers; out.numChannels=2; out.numSamples=count;
        std::vector<dsp_primitives::AudioBufferView> inputs{in};
        std::vector<dsp_primitives::WritableAudioBufferView> outputs{out};
        node.process(inputs,outputs,count);
        for (int i=0;i<count;++i) { result[(offset+i)*2]=outLeft[i]; result[(offset+i)*2+1]=outRight[i]; }
    }
    std::ofstream destination(argv[2],std::ios::binary);
    destination.write(reinterpret_cast<const char*>(result.data()),static_cast<std::streamsize>(result.size()*sizeof(float)));
    return destination?0:2;
}
