#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

#include "TestFilterNode.h"

dsp_primitives::IPrimitiveNode * TestFilterNode::CreateNode(int target) const
{
    return new dsp_primitives::FilterNode(target);
}


bool TestFilterNode::ConfigureNode(dsp_primitives::IPrimitiveNode * node, const TestData & parameters)
{
     dsp_primitives::FilterNode * filternode = dynamic_cast<dsp_primitives::FilterNode *>(node);

    for(const auto & itr : parameters.nodeParameters)
    {
        if(itr.first == "Cutoff")
            filternode->setCutoff(itr.second.data.floatval);
        else if(itr.first == "Resonance")
            filternode->setResonance(itr.second.data.floatval);
        else if(itr.first == "Mix")
            filternode->setMix(itr.second.data.floatval);
        else
            throw new std::exception((std::string("Unknown FilterNode parameter ") + itr.first).c_str());
    }

    return true;
}

std::vector<TestingBase::TestData> * TestFilterNode::GetTestData()
{
    //---------------------------------------------------------------
    {
        //Test 1: Default Low Cutoff
        
        TestData * lowCutoffTest = CreateTest("Default Low Cutoff", 44100, StereoMode_Stereo, 1);
        lowCutoffTest->nodeParameters.insert(std::make_pair("Cutoff", NodeParameterValue(static_cast<float>(1400.0f))));
        lowCutoffTest->nodeParameters.insert(std::make_pair("Resonance", NodeParameterValue(static_cast<float>(0.1f))));
        lowCutoffTest->nodeParameters.insert(std::make_pair("Mix", NodeParameterValue(static_cast<float>(1.0f))));

        //Waveform 1 - single wave
        TestChannels * lowCutoffTestData = CreateTestWaveChannels(lowCutoffTest, 0, 10000);
        CreateTestWaveMix(lowCutoffTestData, 0, 440, 1.0f, 0);
        CreateTestWaveMix(lowCutoffTestData, 1, 980, 0.6f, 32);

        //Waveform 2 - 2 waves mixed together
        lowCutoffTestData = CreateTestWaveChannels(lowCutoffTest, 0, 12003);
        CreateTestWaveMix(lowCutoffTestData, 0, 1440, 0.5f, 10);
        CreateTestWaveMix(lowCutoffTestData, 0, 1200, 1.5f, 0);
        CreateTestWaveMix(lowCutoffTestData, 1, 970, 0.5f, 72);
        CreateTestWaveMix(lowCutoffTestData, 1, 1500, 0.5f, 32);

        //Waveform 3- 3 waves mixed together
        lowCutoffTestData = CreateTestWaveChannels(lowCutoffTest, 0, 10007);
        CreateTestWaveMix(lowCutoffTestData, 0, 1400, 0.33f, 10);
        CreateTestWaveMix(lowCutoffTestData, 0, 1423, 0.30f, 10);
        CreateTestWaveMix(lowCutoffTestData, 0, 1481, 0.25f, 10);
        CreateTestWaveMix(lowCutoffTestData, 1, 1560, 0.5f, 10);
        CreateTestWaveMix(lowCutoffTestData, 1, 1900, 0.4f, 30);
        CreateTestWaveMix(lowCutoffTestData, 1, 2200, 0.2f, 40);
    }

    //---------------------------------------------------------------
    //Test 2: Default Low Cutoff
    {
        TestData * highCutoffResonanceTest = CreateTest("High Cutoff High Resonance", 44100,StereoMode_Stereo, 1);
        highCutoffResonanceTest->nodeParameters.insert(std::make_pair("Cutoff", NodeParameterValue(static_cast<float>(5000.0f))));
        highCutoffResonanceTest->nodeParameters.insert(std::make_pair("Resonance", NodeParameterValue(static_cast<float>(0.8f))));
        highCutoffResonanceTest->nodeParameters.insert(std::make_pair("Mix", NodeParameterValue(static_cast<float>(1.0f))));

        //Waveform 1 - single wave
        TestChannels * highCutoffResonanceTestData = CreateTestWaveChannels(highCutoffResonanceTest, 0, 10000);
        CreateTestWaveMix(highCutoffResonanceTestData, 0, 1000, 0.5f, 0);
        CreateTestWaveMix(highCutoffResonanceTestData, 1, 980, 0.6f, 32);

        //Waveform 2 - 2 waves mixed together
        highCutoffResonanceTestData = CreateTestWaveChannels(highCutoffResonanceTest, 0, 10001);
        CreateTestWaveMix(highCutoffResonanceTestData, 0, 1900, 0.5f, 10);
        CreateTestWaveMix(highCutoffResonanceTestData, 0, 1300, 0.5f, 10);
        CreateTestWaveMix(highCutoffResonanceTestData, 1, 1970, 0.5f, 22);
        CreateTestWaveMix(highCutoffResonanceTestData, 1, 1500, 0.5f, 32);

        //Waveform 3- 3 waves mixed together
        highCutoffResonanceTestData = CreateTestWaveChannels(highCutoffResonanceTest, 0, 9999);
        CreateTestWaveMix(highCutoffResonanceTestData, 0, 200, 0.33f, 10);
        CreateTestWaveMix(highCutoffResonanceTestData, 0, 423, 1.30f, 10);
        CreateTestWaveMix(highCutoffResonanceTestData, 0, 2581, 0.25f, 10);
        CreateTestWaveMix(highCutoffResonanceTestData, 1, 560, 0.5f, 10);
        CreateTestWaveMix(highCutoffResonanceTestData, 1, 900, 0.4f, 10);
        CreateTestWaveMix(highCutoffResonanceTestData, 1, 1200, 0.2f, 20);

        //Waveform 4- 4 waves mixed together
        highCutoffResonanceTestData = CreateTestWaveChannels(highCutoffResonanceTest, 0, 23001);
        CreateTestWaveMix(highCutoffResonanceTestData, 0, 1200, 0.33f, 10);
        CreateTestWaveMix(highCutoffResonanceTestData, 0, 423, 0.30f, 20);
        CreateTestWaveMix(highCutoffResonanceTestData, 0, 2581, 0.25f, 30);
        CreateTestWaveMix(highCutoffResonanceTestData, 0, 3581, 0.25f, 40);
        CreateTestWaveMix(highCutoffResonanceTestData, 1, 1560, 0.5f, 10);
        CreateTestWaveMix(highCutoffResonanceTestData, 1, 900, 1.4f, 32);
        CreateTestWaveMix(highCutoffResonanceTestData, 1, 1200, 0.2f, 20);
        CreateTestWaveMix(highCutoffResonanceTestData, 1, 3200, 0.2f, 66);
    }

    //--------------------------------------------------------------------------------
    //Test 3 : Dry / Wet mix
    {
        TestData * dryWetMixTest = CreateTest("Dry/Wet Mix", 44100, StereoMode_Stereo, 1);
        dryWetMixTest->nodeParameters.insert(std::make_pair("Cutoff", NodeParameterValue(static_cast<float>(2000.0f))));
        dryWetMixTest->nodeParameters.insert(std::make_pair("Resonance", NodeParameterValue(static_cast<float>(0.5f))));
        dryWetMixTest->nodeParameters.insert(std::make_pair("Mix", NodeParameterValue(static_cast<float>(0.7f))));

        
        //Waveform 1 - single wave
        TestChannels * dryWetMixTestData = CreateTestWaveChannels(dryWetMixTest, 0, 10000);
        CreateTestWaveMix(dryWetMixTestData, 0, 1700, 0.5f, 0);
        CreateTestWaveMix(dryWetMixTestData, 1, 1300, 0.6f, 32);

        //Waveform 2 - 2 waves mixed together
        dryWetMixTestData = CreateTestWaveChannels(dryWetMixTest, 0, 10002);
        CreateTestWaveMix(dryWetMixTestData, 0, 1900, 0.5f, 10);
        CreateTestWaveMix(dryWetMixTestData, 0, 1300, 0.5f, 10);
        CreateTestWaveMix(dryWetMixTestData, 1, 2970, 1.5f, 55);
        CreateTestWaveMix(dryWetMixTestData, 1, 1500, 0.5f, 43);

        //Waveform 3- 3 waves mixed together
        dryWetMixTestData = CreateTestWaveChannels(dryWetMixTest, 0, 9999);
        CreateTestWaveMix(dryWetMixTestData, 0, 1200, 1.33f, 17);
        CreateTestWaveMix(dryWetMixTestData, 0, 1423, 1.30f, 80);
        CreateTestWaveMix(dryWetMixTestData, 0, 581, 0.65f, 20);
        CreateTestWaveMix(dryWetMixTestData, 1, 1520, 0.5f, 30);
        CreateTestWaveMix(dryWetMixTestData, 1, 1900, 0.4f, 80);
        CreateTestWaveMix(dryWetMixTestData, 1, 1100, 0.8f, 20);

        //Waveform 4- 4 waves mixed together
        dryWetMixTestData = CreateTestWaveChannels(dryWetMixTest, 0, 23001);
        CreateTestWaveMix(dryWetMixTestData, 0, 2200, 0.53f, 90);
        CreateTestWaveMix(dryWetMixTestData, 0, 2423, 0.80f, 50);
        CreateTestWaveMix(dryWetMixTestData, 0, 2581, 0.545f, 130);
        CreateTestWaveMix(dryWetMixTestData, 0, 3581, 0.95f, 45);
        CreateTestWaveMix(dryWetMixTestData, 1, 560, 0.5f, 10);
        CreateTestWaveMix(dryWetMixTestData, 1, 900, 0.7f, 32);
        CreateTestWaveMix(dryWetMixTestData, 1, 400, 1.8f, 120);
        CreateTestWaveMix(dryWetMixTestData, 1, 200, 0.8f, 66);
    }

    //--------------------------------------------------------------------------------
    //Test 4 : Mono processing
    {
        TestData * monoTest = CreateTest("Mono Processing",44100, StereoMode_Mono, 1);
        monoTest->nodeParameters.insert(std::make_pair("Cutoff", NodeParameterValue(static_cast<float>(3000.0f))));
        monoTest->nodeParameters.insert(std::make_pair("Resonance", NodeParameterValue(static_cast<float>(0.3f))));
        monoTest->nodeParameters.insert(std::make_pair("Mix", NodeParameterValue(static_cast<float>(1.0f))));

        //Waveform 1- 4 waves mixed together
        TestChannels * monoTestData = CreateTestWaveChannels(monoTest, 0, 13000);
        CreateTestWaveMix(monoTestData, 0, 2200, 0.53f, 90);
        CreateTestWaveMix(monoTestData, 0, 2423, 0.80f, 50);
        CreateTestWaveMix(monoTestData, 0, 2581, 0.545f, 130);
        CreateTestWaveMix(monoTestData, 0, 3581, 0.95f, 45);

        monoTestData = CreateTestWaveChannels(monoTest, 0, 10075);
        CreateTestWaveMix(monoTestData, 0, 1200, 0.53f, 0);
        CreateTestWaveMix(monoTestData, 0, 1423, 1.80f, 50);
        CreateTestWaveMix(monoTestData, 0, 1581, 0.545f, 30);
        CreateTestWaveMix(monoTestData, 0, 2581, 0.95f, 45);

        monoTestData = CreateTestWaveChannels(monoTest, 0, 10001);
        CreateTestWaveMix(monoTestData, 0, 200, 0.53f, 0);
        CreateTestWaveMix(monoTestData, 0, 423, 1.20f, 50);
        CreateTestWaveMix(monoTestData, 0, 581, 1.545f, 30);
        CreateTestWaveMix(monoTestData, 0, 581, 0.35f, 45);

        monoTestData = CreateTestWaveChannels(monoTest, 0, 9999);
        CreateTestWaveMix(monoTestData, 0, 1200, 0.53f, 0);
        CreateTestWaveMix(monoTestData, 0, 423, 0.20f, 50);
        CreateTestWaveMix(monoTestData, 0, 2581, 0.45f, 30);
        CreateTestWaveMix(monoTestData, 0, 581, 1.35f, 45);

        monoTestData = CreateTestWaveChannels(monoTest, 0, 23001);
        CreateTestWaveMix(monoTestData, 0, 200, 0.53f, 0);
        CreateTestWaveMix(monoTestData, 0, 2423, 0.30f, 55);
        CreateTestWaveMix(monoTestData, 0, 1581, 0.75f, 25);
        CreateTestWaveMix(monoTestData, 0, 2581, 1.35f, 40);
    }

    //--------------------------------------------------------------------------------
    //Test 5 : Back to Stereo processing
    {
        TestData * stereoTest = CreateTest("Stereo Processing", 44100, StereoMode_Stereo, 1);
        
        //Waveform 1 - single wave
        TestChannels * stereoTestData = CreateTestWaveChannels(stereoTest, 0, 10000);
        CreateTestWaveMix(stereoTestData, 0, 200, 0.53f, 20);
        CreateTestWaveMix(stereoTestData, 0, 3423, 0.30f, 55);
        CreateTestWaveMix(stereoTestData, 0, 1581, 0.245f, 130);
        CreateTestWaveMix(stereoTestData, 0, 4581, 0.25f, 145);
        CreateTestWaveMix(stereoTestData, 1, 1560, 0.8f, 10);
        CreateTestWaveMix(stereoTestData, 1, 2900, 1.7f, 32);
        CreateTestWaveMix(stereoTestData, 1, 3400, 1.2f, 120);
        CreateTestWaveMix(stereoTestData, 1, 2200, 0.4f, 66);

        stereoTestData = CreateTestWaveChannels(stereoTest, 0, 10075);
        CreateTestWaveMix(stereoTestData, 0, 4200, 0.53f, 90);
        CreateTestWaveMix(stereoTestData, 0, 3423, 0.80f, 50);
        CreateTestWaveMix(stereoTestData, 0, 2581, 0.545f, 30);
        CreateTestWaveMix(stereoTestData, 0, 1581, 0.85f, 45);
        CreateTestWaveMix(stereoTestData, 1, 3360, 0.5f, 10);
        CreateTestWaveMix(stereoTestData, 1, 2000, 0.8f, 32);
        CreateTestWaveMix(stereoTestData, 1, 3400, 0.3f, 90);
        CreateTestWaveMix(stereoTestData, 1, 1200, 1.8f, 66);

        stereoTestData = CreateTestWaveChannels(stereoTest, 0, 10001);
        CreateTestWaveMix(stereoTestData, 0, 1200, 0.53f, 95);
        CreateTestWaveMix(stereoTestData, 0, 2423, 0.80f, 51);
        CreateTestWaveMix(stereoTestData, 0, 1581, 0.545f, 11);
        CreateTestWaveMix(stereoTestData, 0, 2581, 0.85f, 145);
        CreateTestWaveMix(stereoTestData, 1, 1560, 0.5f, 60);
        CreateTestWaveMix(stereoTestData, 1, 2900, 0.7f, 132);
        CreateTestWaveMix(stereoTestData, 1, 1400, 0.8f, 100);
        CreateTestWaveMix(stereoTestData, 1, 2200, 0.8f, 66);

        stereoTestData = CreateTestWaveChannels(stereoTest, 0, 9999);
        CreateTestWaveMix(stereoTestData, 0, 2200, 0.53f, 90);
        CreateTestWaveMix(stereoTestData, 0, 2223, 1.80f, 150);
        CreateTestWaveMix(stereoTestData, 0, 2281, 0.545f, 130);
        CreateTestWaveMix(stereoTestData, 0, 3281, 0.95f, 45);
        CreateTestWaveMix(stereoTestData, 1, 520, 0.5f, 10);
        CreateTestWaveMix(stereoTestData, 1, 920, 0.7f, 32);
        CreateTestWaveMix(stereoTestData, 1, 420, 1.8f, 120);
        CreateTestWaveMix(stereoTestData, 1, 220, 0.8f, 66);

        stereoTestData = CreateTestWaveChannels(stereoTest, 0, 23001);
        CreateTestWaveMix(stereoTestData, 0, 2200, 0.13f, 90);
        CreateTestWaveMix(stereoTestData, 0, 3423, 0.20f, 50);
        CreateTestWaveMix(stereoTestData, 0, 2581, 0.345f, 130);
        CreateTestWaveMix(stereoTestData, 0, 3581, 0.45f, 145);
        CreateTestWaveMix(stereoTestData, 1, 2560, 0.1f, 10);
        CreateTestWaveMix(stereoTestData, 1, 3900, 0.2f, 32);
        CreateTestWaveMix(stereoTestData, 1, 4400, 1.3f, 120);
        CreateTestWaveMix(stereoTestData, 1, 3200, 0.4f, 166);
    }

    //---------------------------------------------------------------------------------
    //Test 6 : Extreme
    {
        TestData * extemeTest = CreateTest("Extreme Values", 44100, StereoMode_Stereo, 1);
        extemeTest->nodeParameters.insert(std::make_pair("Cutoff", NodeParameterValue(static_cast<float>(100.0f))));
        extemeTest->nodeParameters.insert(std::make_pair("Resonance", NodeParameterValue(static_cast<float>(1.0f))));
        extemeTest->nodeParameters.insert(std::make_pair("Mix", NodeParameterValue(static_cast<float>(0.5f))));

        TestChannels * extemeTestData = CreateTestWaveChannels(extemeTest, 0, 10000);
        CreateTestWaveMix(extemeTestData, 0, 200, 0.53f, 20);
        CreateTestWaveMix(extemeTestData, 0, 423, 0.30f, 55);
        CreateTestWaveMix(extemeTestData, 0, 581, 0.245f, 130);
        CreateTestWaveMix(extemeTestData, 0, 581, 0.25f, 145);
        CreateTestWaveMix(extemeTestData, 1, 4560, 0.8f, 10);
        CreateTestWaveMix(extemeTestData, 1, 2900, 1.7f, 32);
        CreateTestWaveMix(extemeTestData, 1, 4400, 1.2f, 120);
        CreateTestWaveMix(extemeTestData, 1, 2200, 0.4f, 66);

        extemeTestData = CreateTestWaveChannels(extemeTest, 0, 10000);
        CreateTestWaveMix(extemeTestData, 0, 4200, 0.53f, 90);
        CreateTestWaveMix(extemeTestData, 0, 3423, 0.80f, 50);
        CreateTestWaveMix(extemeTestData, 0, 2581, 0.545f, 30);
        CreateTestWaveMix(extemeTestData, 0, 1581, 0.85f, 45);
        CreateTestWaveMix(extemeTestData, 1, 3360, 0.5f, 10);
        CreateTestWaveMix(extemeTestData, 1, 2000, 0.8f, 32);
        CreateTestWaveMix(extemeTestData, 1, 3400, 0.3f, 90);
        CreateTestWaveMix(extemeTestData, 1, 1200, 1.8f, 66);

        extemeTestData = CreateTestWaveChannels(extemeTest, 0, 10006);
        CreateTestWaveMix(extemeTestData, 0, 200, 0.53f, 95);
        CreateTestWaveMix(extemeTestData, 0, 423, 0.80f, 51);
        CreateTestWaveMix(extemeTestData, 0, 581, 0.545f, 11);
        CreateTestWaveMix(extemeTestData, 0, 581, 0.85f, 145);
        CreateTestWaveMix(extemeTestData, 1, 560, 0.5f, 60);
        CreateTestWaveMix(extemeTestData, 1, 900, 0.7f, 132);
        CreateTestWaveMix(extemeTestData, 1, 400, 0.8f, 100);
        CreateTestWaveMix(extemeTestData, 1, 200, 0.8f, 66);

        extemeTestData = CreateTestWaveChannels(extemeTest, 0, 9999);
        CreateTestWaveMix(extemeTestData, 0, 2200, 0.53f, 90);
        CreateTestWaveMix(extemeTestData, 0, 2223, 1.80f, 150);
        CreateTestWaveMix(extemeTestData, 0, 2281, 0.545f, 130);
        CreateTestWaveMix(extemeTestData, 0, 3281, 0.95f, 45);
        CreateTestWaveMix(extemeTestData, 1, 520, 0.5f, 10);
        CreateTestWaveMix(extemeTestData, 1, 920, 0.7f, 32);
        CreateTestWaveMix(extemeTestData, 1, 420, 1.8f, 120);
        CreateTestWaveMix(extemeTestData, 1, 220, 0.8f, 66);

        extemeTestData = CreateTestWaveChannels(extemeTest, 0, 23001);
        CreateTestWaveMix(extemeTestData, 0, 2200, 0.13f, 90);
        CreateTestWaveMix(extemeTestData, 0, 3423, 0.20f, 50);
        CreateTestWaveMix(extemeTestData, 0, 2581, 0.345f, 130);
        CreateTestWaveMix(extemeTestData, 0, 3581, 0.45f, 145);
        CreateTestWaveMix(extemeTestData, 1, 2560, 0.1f, 10);
        CreateTestWaveMix(extemeTestData, 1, 3900, 0.2f, 32);
        CreateTestWaveMix(extemeTestData, 1, 4400, 1.3f, 120);
        CreateTestWaveMix(extemeTestData, 1, 3200, 0.4f, 166);
    }

    return GetTestDataPtr();
}

