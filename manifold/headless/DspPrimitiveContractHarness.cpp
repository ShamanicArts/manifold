#include "ContractHarnessUtils.h"

#include "../primitives/dsp/CaptureBuffer.h"
#include "../primitives/dsp/LoopBuffer.h"
#include "../primitives/dsp/TempoInference.h"
#include "../primitives/dsp/Playhead.h"
#include "../primitives/dsp/Quantizer.h"

#include <juce_core/juce_core.h>

#include <algorithm>
#include <cmath>
#include <cstring>
#include <cstdio>
#include <numeric>
#include <sstream>
#include <string>
#include <vector>

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

static std::string join(const std::vector<float>& v, const char* sep = ", ") {
    std::ostringstream oss;
    for (size_t i = 0; i < v.size(); ++i) {
        if (i) oss << sep;
        oss << v[i];
    }
    return oss.str();
}

// ---------------------------------------------------------------------------
// CaptureBuffer tests
// ---------------------------------------------------------------------------

static std::string testCaptureBuffer() {
    std::ostringstream out;
    out << "\"captureBuffer\": {\n";

    // 1. empty
    {
        CaptureBuffer empty(0);
        out << "  \"emptyGetSample\": " << empty.getSample(0, 0) << ",\n";
        float buf[4] = { -1, -1, -1, -1 };
        empty.readBlock(buf, 4, 0, 0);
        out << "  \"emptyReadBlock\": [" << join({buf[0],buf[1],buf[2],buf[3]}) << "],\n";
    }

    // 2. write single, read back
    {
        CaptureBuffer cb(16);
        cb.write(0.5f, 0);
        out << "  \"writeSingleGetSample0\": " << cb.getSample(0, 0) << ",\n";
        out << "  \"writeSingleGetSample1\": " << cb.getSample(1, 0) << ",\n";
        out << "  \"offsetAfterWrite\": " << cb.getOffsetToNow(0) << ",\n";
    }

    // 3. write block, read back
    {
        CaptureBuffer cb(16);
        float input[4] = { 0.1f, 0.2f, 0.3f, 0.4f };
        cb.writeBlock(input, 4, 0);
        float output[4] = {};
        cb.readBlock(output, 4, 3, 0);
        out << "  \"writeBlockReadBack\": [" << join({output[0],output[1],output[2],output[3]}) << "],\n";
        out << "  \"offsetAfterBlock\": " << cb.getOffsetToNow(0) << ",\n";
    }

    // 4. wrap-around
    {
        CaptureBuffer cb(4);
        for (int i = 0; i < 6; ++i)
            cb.write(static_cast<float>(i) * 0.1f, 0);
        out << "  \"wrapAroundSample0\": " << cb.getSample(0, 0) << ",\n";
        out << "  \"wrapAroundSample3\": " << cb.getSample(3, 0) << ",\n";
        out << "  \"wrapAroundOffset\": " << cb.getOffsetToNow(0) << ",\n";
    }

    // 5. multi-channel
    {
        CaptureBuffer cb(8);
        cb.setNumChannels(2);
        cb.write(0.1f, 0);
        cb.write(0.9f, 1);
        out << "  \"multiChSampleCh0\": " << cb.getSample(0, 0) << ",\n";
        out << "  \"multiChSampleCh1\": " << cb.getSample(0, 1) << ",\n";
        out << "  \"multiChNumChannels\": " << cb.getNumChannels() << ",\n";
    }

    // 6. clear
    {
        CaptureBuffer cb(4);
        for (int i = 0; i < 4; ++i)
            cb.write(1.0f, 0);
        cb.clear();
        out << "  \"clearAfterFillSample\": " << cb.getSample(0, 0) << ",\n";
        out << "  \"clearOffset\": " << cb.getOffsetToNow(0) << ",\n";
    }

    // 7. gain-scaled write block
    {
        CaptureBuffer cb(8);
        float input[3] = { 1.0f, 2.0f, 3.0f };
        cb.writeBlock(input, 3, 0, 0.5f);
        float output[3] = {};
        cb.readBlock(output, 3, 2, 0);
        out << "  \"gainScaledWrite\": [" << join({output[0],output[1],output[2]}) << "],\n";
    }

    // 8. samplesAgo boundary
    {
        CaptureBuffer cb(4);
        for (int i = 0; i < 4; ++i)
            cb.write(static_cast<float>(i+1) * 0.1f, 0);
        out << "  \"boundaryNewest\": " << cb.getSample(0, 0) << ",\n";
        out << "  \"boundaryOldest\": " << cb.getSample(3, 0) << "\n";
    }

    out << "},\n";
    return out.str();
}

// ---------------------------------------------------------------------------
// LoopBuffer tests
// ---------------------------------------------------------------------------

static std::string testLoopBuffer() {
    std::ostringstream out;
    out << "\"loopBuffer\": {\n";

    // 1. write / read cycle
    {
        LoopBuffer lb;
        lb.setSize(8, 1);
        lb.setSample(0, 0.5f, 0);
        lb.setSample(7, 0.9f, 0);
        out << "  \"setGetSample0\": " << lb.getSample(0, 0) << ",\n";
        out << "  \"setGetSample7\": " << lb.getSample(7, 0) << ",\n";
        out << "  \"unsetSample3\": " << lb.getSample(3, 0) << ",\n";
        out << "  \"length\": " << lb.getLength() << ",\n";
    }

    // 2. addSample
    {
        LoopBuffer lb;
        lb.setSize(4, 1);
        lb.setSample(0, 1.0f, 0);
        lb.addSample(0, 2.0f, 0);
        out << "  \"addSampleResult\": " << lb.getSample(0, 0) << ",\n";
    }

    // 3. copyFrom CaptureBuffer
    {
        CaptureBuffer cap(8);
        float input[4] = { 1.0f, 2.0f, 3.0f, 4.0f };
        cap.writeBlock(input, 4, 0);

        LoopBuffer lb;
        lb.setSize(4, 1);
        lb.copyFrom(cap, 0, 4);
        float s0 = lb.getSample(0, 0);
        float s3 = lb.getSample(3, 0);
        out << "  \"copyFromS0\": " << s0 << ",\n";
        out << "  \"copyFromS3\": " << s3 << ",\n";
    }

    // 4. overdub
    {
        CaptureBuffer cap(8);
        float input[4] = { 1.0f, 1.0f, 1.0f, 1.0f };
        cap.writeBlock(input, 4, 0);

        LoopBuffer lb;
        lb.setSize(4, 1);
        lb.setSample(1, 5.0f, 0);
        lb.overdubFrom(cap, 0, 4);
        out << "  \"overdubS0\": " << lb.getSample(0, 0) << ",\n";
        out << "  \"overdubS1\": " << lb.getSample(1, 0) << ",\n";
        out << "  \"overdubLength\": " << lb.getLength() << ",\n";
    }

    // 5. clear
    {
        LoopBuffer lb;
        lb.setSize(4, 1);
        lb.setSample(0, 99.0f, 0);
        lb.clear();
        out << "  \"clearSample\": " << lb.getSample(0, 0) << ",\n";
        out << "  \"clearLength\": " << lb.getLength() << "\n";
    }

    out << "},\n";
    return out.str();
}

// ---------------------------------------------------------------------------
// TempoInference tests
// ---------------------------------------------------------------------------

static std::string testTempoInference() {
    std::ostringstream out;
    out << "\"tempoInference\": {\n";

    TempoInference ti;

    // 1. basic match: 4 bars at 120 BPM, 4/4 time
    {
        auto res = ti.findBestMatch(8.0, 120.0, 4);
        out << "  \"basicMatchTempo\": " << res.tempo << ",\n";
        out << "  \"basicMatchBars\": " << res.numBars << ",\n";
        out << "  \"basicMatchValid\": " << (res.valid ? "true" : "false") << ",\n";
    }

    // 2. 3/4 time
    {
        auto res = ti.findBestMatch(6.0, 120.0, 3);
        out << "  \"threeFourTempo\": " << res.tempo << ",\n";
        out << "  \"threeFourBars\": " << res.numBars << ",\n";
    }

    // 3. duration zero -> invalid
    {
        auto res = ti.findBestMatch(0.0, 120.0, 4);
        out << "  \"zeroDurationValid\": " << (res.valid ? "true" : "false") << ",\n";
    }

    // 4. allow3612 = false filters 3,6,12 bars
    {
        ti.setAllow3612(false);
        auto res = ti.findBestMatch(8.0, 120.0, 4);
        out << "  \"no3612Tempo\": " << res.tempo << ",\n";
        out << "  \"no3612Bars\": " << res.numBars << ",\n";
        ti.setAllow3612(true);
    }

    // 5. getSamplesPerBar
    {
        float spb = ti.getSamplesPerBar(120.0f, 4, 44100.0);
        out << "  \"samplesPerBar\": " << spb << ",\n";
    }

    // 6. getSamplesForBars
    {
        float sf = ti.getSamplesForBars(2.0f, 120.0f, 4, 44100.0);
        out << "  \"samplesFor2Bars\": " << sf << "\n";
    }

    out << "},\n";
    return out.str();
}

// ---------------------------------------------------------------------------
// Playhead tests
// ---------------------------------------------------------------------------

static std::string testPlayhead() {
    std::ostringstream out;
    out << "\"playhead\": {\n";

    Playhead ph;

    // 1. default state
    out << "  \"defaultPosition\": " << ph.getPosition() << ",\n";
    out << "  \"defaultSpeed\": " << ph.getSpeed() << ",\n";
    out << "  \"defaultReversed\": " << (ph.isReversed() ? "true" : "false") << ",\n";
    out << "  \"defaultLooping\": " << (ph.isLooping() ? "true" : "false") << ",\n";

    // 2. setLength + setPosition + wrapping
    {
        ph.setLength(100);
        ph.setPosition(50.0f);
        out << "  \"setPos50\": " << ph.getPosition() << ",\n";
        ph.setPosition(150.0f);
        out << "  \"wrapPos150\": " << ph.getPosition() << ",\n";
        ph.setPosition(-10.0f);
        out << "  \"wrapNeg10\": " << ph.getPosition() << ",\n";
    }

    // 3. advance forward
    {
        ph.setLength(100);
        ph.setPosition(0.0f);
        float loopCount = ph.advance(10);
        out << "  \"advance10Pos\": " << ph.getPosition() << ",\n";
        out << "  \"advance10LoopCount\": " << loopCount << ",\n";
    }

    // 4. advance with loop wrap
    {
        ph.setLength(100);
        ph.setPosition(95.0f);
        float loopCount = ph.advance(10);
        out << "  \"wrapAdvancePos\": " << ph.getPosition() << ",\n";
        out << "  \"wrapAdvanceLoopCount\": " << loopCount << ",\n";
    }

    // 5. reversed
    {
        ph.setLength(100);
        ph.setPosition(50.0f);
        ph.setReversed(true);
        float loopCount = ph.advance(10);
        out << "  \"reverseAdvancePos\": " << ph.getPosition() << ",\n";
        out << "  \"reverseAdvanceLoopCount\": " << loopCount << ",\n";
        ph.setReversed(false);
    }

    // 6. speed scaling
    {
        ph.setLength(100);
        ph.setPosition(0.0f);
        ph.setSpeed(0.5f);
        ph.advance(20);
        out << "  \"halfSpeedPos\": " << ph.getPosition() << ",\n";
        ph.setSpeed(2.0f);
        ph.setPosition(0.0f);
        ph.advance(10);
        out << "  \"doubleSpeedPos\": " << ph.getPosition() << ",\n";
        ph.setSpeed(1.0f);
    }

    // 7. non-looping
    {
        Playhead nph;
        nph.setLength(100);
        nph.setLooping(false);
        nph.setPosition(95.0f);
        nph.setReversed(false);
        float loopCount = nph.advance(10);
        out << "  \"nonLoopAdvancePos\": " << nph.getPosition() << ",\n";
        out << "  \"nonLoopAdvanceLoopCount\": " << loopCount << ",\n";
        nph.setReversed(true);
        nph.setPosition(5.0f);
        loopCount = nph.advance(10);
        out << "  \"nonLoopReversePos\": " << nph.getPosition() << ",\n";
    }

    // 8. reset
    {
        ph.setLength(100);
        ph.setPosition(50.0f);
        ph.reset();
        out << "  \"resetPosition\": " << ph.getPosition() << ",\n";
    }

    // 9. length=0 edge case
    {
        Playhead zph;
        zph.setLength(0);
        zph.setPosition(50.0f);
        out << "  \"zeroLengthGetPos\": " << zph.getPosition() << ",\n";
        float loopCount = zph.advance(10);
        out << "  \"zeroLengthAdvance\": " << zph.getPosition() << ",\n";
        out << "  \"zeroLengthLoopCount\": " << loopCount << "\n";
    }

    out << "},\n";
    return out.str();
}

// ---------------------------------------------------------------------------
// Quantizer tests
// ---------------------------------------------------------------------------

static std::string testQuantizer() {
    std::ostringstream out;
    out << "\"quantizer\": {\n";

    Quantizer q;
    q.setTempo(120.0f);
    q.setSampleRate(44100.0);

    // 1. division samples at 120 BPM, 4/4
    {
        out << "  \"quarterSamples\": " << q.getDivisionSamples(Quantizer::Division::Quarter) << ",\n";
        out << "  \"eighthSamples\": " << q.getDivisionSamples(Quantizer::Division::Eighth) << ",\n";
        out << "  \"sixteenthSamples\": " << q.getDivisionSamples(Quantizer::Division::Sixteenth) << ",\n";
        out << "  \"tripletSamples\": " << q.getDivisionSamples(Quantizer::Division::Triplet) << ",\n";
        out << "  \"dottedSamples\": " << q.getDivisionSamples(Quantizer::Division::Dotted) << ",\n";
    }

    // 2. quantizeToNearest
    {
        int qn = q.getDivisionSamples(Quantizer::Division::Quarter);
        out << "  \"quantExactQuarter\": " << q.quantizeToNearest(static_cast<double>(qn), Quantizer::Division::Quarter) << ",\n";
        int halfQuarter = qn / 2;
        out << "  \"quantHalfway\": " << q.quantizeToNearest(static_cast<double>(halfQuarter), Quantizer::Division::Quarter) << ",\n";
    }

    // 3. quantizeUp / quantizeDown
    {
        int qn = q.getDivisionSamples(Quantizer::Division::Quarter);
        int between = qn / 2;
        out << "  \"quantUpHalfway\": " << q.quantizeUp(static_cast<double>(between), Quantizer::Division::Quarter) << ",\n";
        out << "  \"quantDownHalfway\": " << q.quantizeDown(static_cast<double>(between), Quantizer::Division::Quarter) << ",\n";
    }

    // 4. different tempo
    {
        q.setTempo(140.0f);
        out << "  \"tempo140Quarter\": " << q.getDivisionSamples(Quantizer::Division::Quarter) << ",\n";
        q.setTempo(120.0f);
    }

    // 5. findNearestDivision
    {
        int qn = q.getDivisionSamples(Quantizer::Division::Quarter);
        auto div = q.findNearestDivision(static_cast<double>(qn + 1));
        out << "  \"nearQuarterNearest\": " << static_cast<int>(div) << ",\n";
    }

    // 6. quantizeToNearestLegal
    {
        int qn = q.getDivisionSamples(Quantizer::Division::Quarter);
        out << "  \"legalExactQuarter\": " << q.quantizeToNearestLegal(static_cast<double>(qn)) << ",\n";
        int en = q.getDivisionSamples(Quantizer::Division::Eighth);
        out << "  \"legalNearEighth\": " << q.quantizeToNearestLegal(static_cast<double>(en + 2)) << "\n";
    }

    out << "}";
    return out.str();
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

int main(int argc, char* argv[]) {
    contract_harness_utils::HarnessOptions opts;
    if (!contract_harness_utils::parseOptions(argc, argv, opts))
        return 1;

    std::ostringstream json;
    json << "{\n";
    json << testCaptureBuffer();
    json << testLoopBuffer();
    json << testTempoInference();
    json << testPlayhead();
    json << testQuantizer();
    json << "\n}\n";

    return contract_harness_utils::finishJsonContract(
        opts, "DspPrimitiveContract", json.str());
}
