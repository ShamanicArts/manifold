#pragma once
#include "TestingBase.h"

#include "dsp/core/nodes/GainNode.h"

class TestGainNode : public TestingBase
{
public:
    virtual const char * GetName() const override
    {
        return "GainNode";
    }

    virtual dsp_primitives::IPrimitiveNode * CreateNode(int target) const;

    virtual std::vector<TestData> * GetTestData() override;

    //Configure the specified node. Test specific because of the different parameters that each node has.
    virtual bool ConfigureNode(dsp_primitives::IPrimitiveNode * node, const TestData & parameters) override;
};
