# Dimension 11: Speech Synthesis Cross-Domain Learning
## What Musical Concatenative Synthesis Can Learn From (and Teach) Speech Synthesis

**Research Date**: April 2026  
**Scope**: Unit selection speech synthesis (Hunt & Black 1996), HMM-based parametric synthesis (HTS), deep learning TTS (Tacotron, WaveNet, FastSpeech, Deep Voice), concatenative vs. neural TTS debate, Talkapiller (IRCAM), cross-domain hybrids, emotional/expressive speech synthesis, diphone synthesis, statistical parametric vs. concatenative trade-offs, SPSS paradigm.

---

## Table of Contents
1. [Executive Summary](#executive-summary)
2. [Historical Evolution](#historical-evolution)
3. [Current State (2024–2026)](#current-state-2024–2026)
4. [Key Actors & Stakeholders](#key-actors--stakeholders)
5. [Foundational Frameworks: Unit Selection and Cost Functions](#foundational-frameworks)
6. [Statistical Parametric Speech Synthesis (SPSS / HTS)](#statistical-parametric-speech-synthesis)
7. [The Neural TTS Revolution](#the-neural-tts-revolution)
8. [The Concatenative vs. Neural TTS Debate](#the-concatenative-vs-neural-tts-debate)
9. [Emotional and Expressive Speech Synthesis](#emotional-and-expressive-speech-synthesis)
10. [Cross-Domain Hybrids: Music + Speech](#cross-domain-hybrids-music--speech)
11. [Tensions, Counter-Narratives, and Trade-offs](#tensions-counter-narratives-and-trade-offs)
12. [What Music Synthesis Teaches Speech Synthesis](#what-music-synthesis-teaches-speech-synthesis)
13. [What Speech Synthesis Teaches Music Synthesis](#what-speech-synthesis-teaches-music-synthesis)
14. [Concrete Examples and Implementations](#concrete-examples-and-implementations)
15. [Conclusion and Future Directions](#conclusion-and-future-directions)

---

## Executive Summary

This research investigates the bidirectional learning between musical concatenative synthesis and speech synthesis—two fields that share a common theoretical foundation (unit selection, corpus-based concatenation, cost-function optimization) but have evolved along largely separate trajectories. Speech synthesis has "won" commercially with neural TTS (WaveNet, Tacotron, VALL-E), while musical concatenative synthesis (CataRT, Caterpillar) remains a niche artistic practice. However, critical findings—especially Cohn & Zellou's (2020) discovery that concatenative TTS is more intelligible in noise than neural TTS—demonstrate that concatenative methods retain unique advantages. Cross-domain hybrids such as IRCAM's Talkapiller and Beller et al.'s (2005) system explicitly bridge music and speech corpora. The research reveals that speech synthesis has developed rigorous cost-function frameworks (target cost, join cost, Viterbi search) that could inform musical systems, while musical concatenative synthesis has pioneered real-time interactive exploration, heterogeneous corpora, and gestural control that could enrich speech synthesis interfaces.

---

## Historical Evolution

### The Diphone Era (1980s–early 1990s)

The foundation of modern concatenative speech synthesis was laid by diphone synthesis, which concatenated the second half of one phone with the first half of the following phone to preserve coarticulation.

Claim: "Pitch-synchronous waveform processing techniques for text-to-speech synthesis using diphones" (Moulines & Charpentier, 1990) established PSOLA-based diphone concatenation as the dominant high-quality speech synthesis approach of the late 1980s and early 1990s.[^1^]
Source: Moulines & Charpentier (1990), Speech Communication  
URL: https://www.fon.hum.uva.nl/praat/manual/Moulines___Charpentier__1990_.html  
Date: 1990  
Excerpt: "Pitch-synchronous waveform processing techniques for text-to-speech synthesis using diphones."  
Context: This work, developed at CNET (France), used the PSOLA (Pitch Synchronous Overlap-Add) algorithm to concatenate diphone units with natural prosody, representing the state-of-the-art before large-unit selection.  
Confidence: high

Claim: Diphone synthesis represented a template-based approach that contrasted with knowledge-based formant synthesis (Klatt 1980), reflecting the "Von Kempelen/Dudley dichotomy" that persists in synthesis today.[^2^]
Source: Illinois ECE 420 Course Notes  
URL: https://courses.physics.illinois.edu/ece420/sp2019/5_PSOLA.pdf  
Date: 2019 (historical compilation)  
Excerpt: "The best quality is presently obtained by diphone based approaches or the like, using simply PCM encoded signals, especially illustrated by the Psola system designed at CNET (Moulines and Charpentier, 1990)."  
Context: Diphone synthesis achieved high quality but required a single recorded instance of each diphone, limiting naturalness and contextual appropriateness.  
Confidence: high

### The Unit Selection Revolution (1996)

Hunt & Black's 1996 paper transformed concatenative synthesis by treating unit selection as a search problem with target and concatenation costs, analogous to HMM-based speech recognition.

Claim: "One approach to the generation of natural-sounding synthesized speech waveforms is to select and concatenate units from a large speech database. Units (in the current work, phonemes) are selected to produce a natural realisation of a target phoneme sequence predicted from text which is annotated with prosodic and phonetic context information."[^3^]
Source: Hunt & Black (1996), ICASSP  
URL: https://www.ee.columbia.edu/~dpwe/e6820/papers/HuntB96-speechsynth.pdf  
Date: 1996  
Excerpt: "We propose that the units in a synthesis database can be considered as a state transition network in which the state compared cost is the distance between a database unit and a target, and the transition cost is an estimate of the quality of concatenation of two consecutive units."  
Context: This paper established the mathematical framework (target cost + concatenation cost, Viterbi search) that underpins all modern unit selection synthesis.  
Confidence: high

Claim: The two cost functions in unit selection are target cost C^t(u_i, t_i) measuring mismatch between target specification and candidate unit, and concatenation cost C^c(u_{i-1}, u_i) measuring perceptual mismatch at unit joins.[^4^]
Source: Aalto Speech Processing Book, Chapter 9.1  
URL: https://speechprocessingbook.aalto.fi/Synthesis/Concatenative_speech_synthesis.html  
Date: N/A (online textbook)  
Excerpt: "Target cost describes the mismatch between the target speech unit specification t_i and a candidate unit u_i from the database. Concatenation cost describes the mismatch (e.g., acoustic or perceptual) of the join between the candidate unit u_i and the preceding unit u_{i-1}."  
Context: This formulation enables mathematically principled and optimal unit selection, though weight optimization remains a major research challenge.  
Confidence: high

### The Statistical Parametric Turn (1999–2000s)

HMM-based speech synthesis (HTS), pioneered by Yoshimura, Tokuda, and others at Nitech/Nagoya Institute of Technology, offered a fundamentally different paradigm: generating speech parameters from statistical models rather than selecting waveform units.

Claim: "A statistical parametric speech synthesis system based on hidden Markov models (HMMs) has grown in popularity over the last few years. This system simultaneously models spectrum, excitation, and duration of speech using context-dependent HMMs and generates speech waveforms from the HMMs themselves."[^5^]
Source: Zen et al. (2007), HTS Version 2.0, SSW 2007  
URL: https://www.isca-archive.org/ssw_2007/zen07_ssw.html  
Date: 2007  
Excerpt: "Currently the most popular speech synthesis technique is unit selection... Although it is very hard to surpass the quality of the best examples of unit selection, it does have a limitation that the synthesized speech will strongly resemble the style of the speech recorded in the database."  
Context: HTS traded naturalness for flexibility, small footprint, and easy style/voice modification through adaptation and interpolation.  
Confidence: high

Claim: The biggest drawback of SPSS (HTS) is "Quality"—specifically buzzy, muffled speech caused by vocoder quality, modeling accuracy, and over-smoothing.[^6^]
Source: Black, Zen, Tokuda (2009), "Statistical Parametric Speech Synthesis" tutorial  
URL: https://pdfs.semanticscholar.org/138c/c7756e3c220b8f7af468067fb71f749c5f97.pdf  
Date: 2009  
Excerpt: "The biggest drawback is 'Quality'. Buzzy, muffled speech... What causes the quality degradation? Vocoder quality (parameterization & excitation), Modeling accuracy, Over-smoothing."  
Context: Over-smoothing—the averaging inherent in statistical parameter generation—remains the central quality challenge of parametric approaches.  
Confidence: high

---

## Current State (2024–2026)

### Neural TTS Has "Won" Commercially

Claim: "Neural TTS has effectively replaced concatenative TTS for all new voice AI deployments. The quality gap is too large to ignore."[^7^]
Source: Anve Voice, "Neural TTS vs Concatenative TTS (2026)"  
URL: https://anvevoice.app/cross-compare/neural-tts-vs-concatenative-tts  
Date: 2026-03-14  
Excerpt: "Verdict: Neural TTS has effectively replaced concatenative TTS for all new voice AI deployments. The quality gap is too large to ignore."  
Context: This commercial assessment reflects the industry consensus that neural approaches (Tacotron, WaveNet, VALL-E) dominate new deployments.  
Confidence: medium (commercial blog, but consistent with industry trends)

Claim: Amazon Polly offers four distinct engines: Standard (concatenative), Neural (sequence-to-sequence NTTS), Long-Form, and Generative (billion-parameter transformer), reflecting a stratified market where different synthesis methods serve different use cases.[^8^]
Source: BlockSentient Tool Briefing  
URL: https://blocksentient.com/briefings/briefing_amazon-polly.pdf  
Date: N/A  
Excerpt: "Amazon Polly offers Standard (concatenative synthesis), Neural (sequence-to-sequence NTTS), Long-Form (optimized for extended content like articles and training materials), and Generative (billion-parameter transformer) engines."  
Context: The continued availability of concatenative engines alongside neural ones demonstrates that concatenative synthesis retains specific use cases (e.g., low latency, deterministic output, out-of-domain robustness).  
Confidence: high

### The Neural Codec Language Model Paradigm (2023–2026)

Claim: VALL-E (Microsoft, 2023) achieved a breakthrough in zero-shot TTS by treating speech synthesis as a conditional language modeling task over discrete audio codec tokens, trained on 60,000 hours of English speech.[^9^]
Source: Microsoft Research, VALL-E project page  
URL: https://www.microsoft.com/en-us/research/project/vall-e-x/vall-e/  
Date: 2025-05-09 (page update)  
Excerpt: "VALL-E emerges in-context learning capabilities and can be used to synthesize high-quality personalized speech with only a 3-second enrolled recording of an unseen speaker as an acoustic prompt."  
Context: VALL-E's codec-based approach (EnCodec tokens + autoregressive language model) has spawned an entire family of successors: VALL-E X, VALL-E R, VALL-E 2, and open-source implementations.  
Confidence: high

Claim: VALL-E 2 achieved "human parity in zero-shot TTS performance on LibriSpeech and VCTK datasets"—the first such achievement.[^10^]
Source: VALL-E 2 project page  
URL: https://www.microsoft.com/en-us/research/project/vall-e-x/  
Date: 2025-05-09  
Excerpt: "VALL-E 2 achieves a groundbreaking milestone: human parity in zero-shot TTS performance on LibriSpeech and VCTK datasets. This marks the first instance of such an achievement."  
Context: Human parity in TTS represents the culmination of the neural revolution that began with WaveNet in 2016.  
Confidence: high

Claim: The modern TTS stack (2024–2026) consists of neural codecs (SoundStream, EnCodec, Mimi), acoustic/waveform generators (diffusion, flow, normalizing flow), and highly engineered commercial APIs.[^11^]
Source: "How Open is Open TTS?", arXiv 2026  
URL: https://arxiv.org/html/2603.24116  
Date: 2026-04-01  
Excerpt: "Nowadays, generative speech or more traditionally speech synthesis is a stack of complementary advances: neural codecs that compress and represent waveforms, acoustic and waveform generators based on diffusion/flow/normalizing-flow/variational families, and highly engineered commercial systems that package these models into APIs and products."  
Context: The field has shifted from modeling raw waveforms (WaveNet) to modeling discrete or latent representations via codec-based language models.  
Confidence: high

### Concatenative Revival in Hybrid Approaches

Claim: "In 2025, hybrid approaches often combine concatenative components with neural prosody or vocoder modules to gain benefits from both worlds."[^12^]
Source: ShadeCoder, "Concatenative TTS: A Comprehensive Guide for 2025"  
URL: https://www.shadecoder.com/ja/topics/concatenative-tts-a-comprehensive-guide-for-2025  
Date: 2026-01-02  
Excerpt: "In 2025, hybrid approaches often combine concatenative components with neural prosody or vocoder modules to gain benefits from both worlds."  
Context: Hybrid approaches represent a potential convergence where musical concatenative synthesis concepts (descriptor-based selection, heterogeneous corpora) meet neural synthesis advantages.  
Confidence: medium

Claim: "Concatenative synthesis typically serves as a specialized component rather than a complete replacement for neural TTS. Use it for signature phrases, brand-specific pronunciations, or unique character voices while relying on neural methods for general conversation."[^13^]
Source: Vapi.ai blog, "How to Create Natural Audio Using Concatenative Synthesis"  
URL: https://vapi.ai/blog/concatenative-synthesis  
Date: 2025-05-30  
Excerpt: "Concatenative synthesis typically serves as a specialized component rather than a complete replacement for neural TTS. Use it for signature phrases, brand-specific pronunciations, or unique character voices while relying on neural methods for general conversation."  
Context: This practical advice reflects a nuanced industry view: concatenative synthesis is not obsolete but has been repositioned as a specialized tool within hybrid pipelines.  
Confidence: medium

---

## Key Actors & Stakeholders

### Research Institutions
- **ATR/NICT (Japan)**: Hunt & Black developed unit selection at ATR Interpreting Telecommunications Research Labs (1996); CHATR emotional synthesis (Iida, Campbell)
- **Nagoya Institute of Technology / Nitech (Japan)**: Tokuda, Zen, Yamagishi—HTS toolkit and statistical parametric speech synthesis
- **University of Edinburgh / CSTR (UK)**: Simon King, Korin Richmond, Rob Clark—Festival, Multisyn, hybrid synthesis, target cost learning
- **CMU (USA)**: Alan W. Black—Festival, FestVox, unit selection, clustergen
- **IRCAM (France)**: Diemo Schwarz, Grégory Beller, Xavier Rodet—Caterpillar, CataRT, Talkapiller, hybrid music/speech concatenative synthesis
- **DeepMind / Google (UK)**: Aäron van den Oord, Heiga Zen, Yuxuan Wang—WaveNet, Tacotron
- **Microsoft Research (USA/China)**: Chengyi Wang et al.—VALL-E family of neural codec TTS models
- **Apple**: Tuomo Raitio et al.—vocal effort modeling for intelligibility in noise

### Open-Source Projects
- **HTS Toolkit**: http://hts.sp.nitech.ac.jp (since 2002)
- **Festival / FestVox**: https://www.cstr.ed.ac.uk/projects/festival/
- **CataRT**: https://imtr.ircam.fr (Max/MSP, GPL)
- **MaryTTS**: DFKI's open-source TTS
- **VALL-E X (open-source)**: Plachtaa's implementation of Microsoft's VALL-E

### Commercial Systems
- Amazon Polly (Standard/NTTS/Long-Form/Generative)
- Google Cloud Text-to-Speech (WaveNet, Neural2)
- Microsoft Azure Speech (neural voices)
- ElevenLabs (neural TTS, $3.3B valuation, 2025)

---

## Foundational Frameworks: Unit Selection and Cost Functions

### Target Cost and Join Cost

The mathematical framework established by Hunt & Black (1996) remains the theoretical foundation of concatenative synthesis in both speech and music domains.

Claim: "The selection is guided by two cost functions, join and target cost, and the string of acoustic units with minimal total cost is selected. The cost functions may include contributions of several features calculated as sub-costs."[^14^]
Source: Pobar, Martinčić-Ipšić, Ipšić (2012), Neural Network World  
URL: https://www.nnw.cz/doi/2012/NNW.2012.22.026.pdf  
Date: 2012  
Excerpt: "The target cost T(u_t, s_t) is a difference measure between a unit u_t in the corpus and a target unit s_t... The join cost J(u_t, u_{t+1}) is a measure of how perceptible is the join between two consecutive units."  
Context: The challenge of designing perceptually optimal sub-costs and their weights remains active research.  
Confidence: high

### Perceptually Learned Target Costs

A significant advance came from learning target costs from perceptual data rather than hand-tuning.

Claim: "Our goal is to automatically learn a perceptually-optimal target cost function for a unit selection speech synthesiser. The approach we take here is to train a classifier on human perceptual judgements of synthetic speech."[^15^]
Source: Strom & King (2010), Interspeech  
URL: https://www.isca-archive.org/interspeech_2010/strom10_interspeech.html  
Date: 2010  
Excerpt: "A/B preference tests showed that the classifier-based target cost, which was learned completely automatically from modest amounts of perceptual data, is almost as good as our carefully-and expertly-tuned standard target cost."  
Context: This work at CSTR/Edinburgh demonstrated that machine learning could automate the most painstaking aspect of unit selection synthesis—target cost tuning.  
Confidence: high

### Cost Function Optimization

Claim: "The perceptual evaluation results support the use of speech recognition results as an objective criterion for optimizing the weights in the unit selection concatenative speech synthesis system."[^16^]
Source: Pobar et al. (2012), Neural Network World  
URL: https://www.nnw.cz/doi/2012/NNW.2012.22.026.pdf  
Date: 2012  
Excerpt: "The proposed method improves speech quality and intelligibility... The unit selection system performed best with the mean quality scores of 3.42 and acceptance scores of 4 for text in domain of the training corpus."  
Context: Using ASR WER as an objective proxy for perceptual quality avoids expensive listening tests during weight optimization.  
Confidence: medium

---

## Statistical Parametric Speech Synthesis

### The HTS Paradigm

Claim: "The HMM-based Speech Synthesis System (HTS) simultaneously models spectrum, excitation, and duration of speech using context-dependent HMMs and generates speech waveforms from the HMMs themselves."[^17^]
Source: Zen et al. (2007), SSW 2007 / IEEE  
URL: https://research.google/pubs/the-hmm-based-speech-synthesis-system-hts-version-20/  
Date: 2007  
Excerpt: "Since December 2002, we have publicly released an open-source software toolkit named HMM-based speech synthesis system (HTS) to provide a research and development platform for the speech synthesis community."  
Context: HTS enabled a generation of researchers to experiment with statistical parametric synthesis without building systems from scratch.  
Confidence: high

### Over-Smoothing: The Central Problem

Claim: "The main drawback of statistical parametric speech synthesis is that the spectra and prosody generated from HMMs tend to be over-smooth and lacking the richness of detail present in natural spectral and prosodic patterns because of the averaging inherent in the statistical approach."[^18^]
Source: King (2010), "A beginners' guide to statistical parametric speech synthesis"  
URL: https://www.cstr.ed.ac.uk/downloads/publications/2010/king_hmm_tutorial.pdf  
Date: 2010  
Excerpt: "Averaging, which is an inevitable process in the training of the statistical model, can cause the speech to sound muffled. Averaging together many frames of speech, each with slightly differing spectral properties, will have the effect of widening the formant bandwidths."  
Context: Over-smoothing motivated hybrid approaches that combine HMM parameter generation with unit selection waveform concatenation.  
Confidence: high

Claim: Global Variance (GV) modeling, introduced by Toda et al. (2004), is the most prominent technique for alleviating over-smoothing by ensuring generated parameter trajectories have variance comparable to natural speech.[^19^]
Source: Black, Zen, Tokuda (2009)  
URL: https://pdfs.semanticscholar.org/138c/c7756e3c220b8f7af468067fb71f749c5f97.pdf  
Date: 2009  
Excerpt: "Use of Global Variance (GV)... GV: intra-utterance variance. Generated speech → GV becomes small. Incorporate GV PDF into generation algorithm."  
Context: GV became a standard component of HTS, though it only partially addresses the fundamental averaging problem.  
Confidence: high

---

## The Neural TTS Revolution

### WaveNet (2016)

Claim: "WaveNets can generate raw speech signals with subjective naturalness never before reported in the field of text-to-speech (TTS), as assessed by human raters."[^20^]
Source: van den Oord et al. (2016), "WaveNet: A Generative Model for Raw Audio"  
URL: https://arxiv.org/abs/1609.03499  
Date: 2016-09-12  
Excerpt: "When applied to text-to-speech, it yields state-of-the-art performance, with human listeners rating it as significantly more natural sounding than the best parametric and concatenative systems for both English and Mandarin."  
Context: WaveNet's dilated causal convolutions enabled modeling raw waveforms at 16,000+ samples/second, though it was initially computationally impractical for production.  
Confidence: high

### Tacotron and End-to-End TTS (2017)

Claim: "Tacotron achieves a 3.82 subjective 5-scale mean opinion score on US English, outperforming a production parametric system in terms of naturalness."[^21^]
Source: Wang et al. (2017), "Tacotron: Towards End-to-End Speech Synthesis"  
URL: https://arxiv.org/abs/1703.10135  
Date: 2017-03-29  
Excerpt: "We present Tacotron, an end-to-end generative text-to-speech model that synthesizes speech directly from characters. Given <text, audio> pairs, the model can be trained completely from scratch with random initialization."  
Context: Tacotron eliminated the need for complex linguistic feature engineering, learning pronunciation and prosody directly from data via sequence-to-sequence attention.  
Confidence: high

### FastSpeech: Non-Autoregressive Speed (2019)

Claim: FastSpeech introduced non-autoregressive generation, achieving 270x speedup over Tacotron 2 while maintaining quality.[^22^]
Source: TTS Library, "History of text-to-speech technology"  
URL: https://ttslibrary.com/resources/history-of-text-to-speech  
Date: 2026-04-07  
Excerpt: "FastSpeech achieved 270x speedup over Tacotron 2 while maintaining quality. FastSpeech 2 (2020) further improved with variance predictors for duration, pitch, and energy."  
Context: FastSpeech addressed the critical deployment bottleneck of autoregressive neural TTS—speed—while maintaining quality.  
Confidence: high

### Deep Voice (Baidu, 2017)

Claim: "Deep Voice is a multi-component neural TTS system with five building blocks: graphene-to-phoneme, segmentation, phoneme duration, fundamental frequency, and audio synthesis models."[^23^]
Source: Arik et al. (2017), "Deep Voice: Real-time Neural Text-to-Speech"  
URL: https://arxiv.org/pdf/1702.07825  
Date: 2017  
Excerpt: "During inference, text is fed through the graphene-to-phoneme model... Next, the phonemes are provided as inputs to the phoneme duration model and F0 prediction model... Finally, the phonemes, phoneme durations, and F0 are used as local conditions input features to the audio synthesis model."  
Context: Deep Voice was notable for real-time inference but required independently trained components, making error diagnosis difficult.  
Confidence: high

---

## The Concatenative vs. Neural TTS Debate

### The Intelligibility Paradox: Cohn & Zellou (2020)

The most important cross-domain finding for concatenative synthesis is that neural TTS, despite sounding more natural, is LESS intelligible in noise than concatenative TTS.

Claim: "Correct word identification was lower for neural TTS than for concatenative TTS, in the lower SNR, and for semantically unpredictable sentences."[^24^]
Source: Cohn & Zellou (2020), Interspeech 2020  
URL: https://www.isca-archive.org/interspeech_2020/cohn20_interspeech.html  
Date: 2020  
Excerpt: "In Experiment 1, listeners identified target words in semantically predictable and unpredictable sentences in concatenative and neural TTS at two noise levels (-3 dB, -6 dB SNR). Correct word identification was lower for neural TTS than for concatenative TTS."  
Context: This study used identical speaker training datasets for 4 AWS Polly voices, isolating the synthesis method as the only variable.  
Confidence: high

Claim: "Neural TTS was rated as more human-like, natural, likeable, and familiar than concatenative TTS. Furthermore, how natural listeners rated the neural TTS voice was positively related to their speech-in-noise accuracy."[^25^]
Source: Cohn & Zellou (2020), full paper  
URL: https://www.isca-archive.org/interspeech_2020/cohn20_interspeech.pdf  
Date: 2020  
Excerpt: "Neural TTS was rated as more human-like, natural, likeable, and familiar than concatenative TTS... This finding suggests that neural TTS, while increasingly naturalistic, may actually reduce listeners' ability to understand speech from a modern voice-AI system, if it's being used in the presence of competing noise."  
Context: The paradox is that neural TTS's naturalness includes casual/connected speech characteristics (reductions, coarticulation) that hurt intelligibility in adverse conditions—just as casual human speech is less intelligible in noise than clear speech.  
Confidence: high

### Neural TTS as "Casual Speech," Concatenative as "Clear Speech"

Claim: "Neural and concatenative TTS could serve as proxies for 'casual' and 'clear' speech, respectively. Neural TTS is more likely to contain phonetic reductions, typical of natural human speech... Concatenative TTS, on the other hand, is more likely to result in relatively more hyper-articulated 'clear' speech."[^26^]
Source: Cohn & Zellou (2020)  
URL: https://www.isca-archive.org/interspeech_2020/cohn20_interspeech.pdf  
Date: 2020  
Excerpt: "Neural TTS is more likely to contain phonetic reductions... Concatenative TTS... is more likely to result in relatively more hyper-articulated 'clear' speech; each segment is carefully selected and combined."  
Context: This insight has direct implications for safety-critical applications (aviation, military, public address) where intelligibility in noise matters more than naturalness.  
Confidence: high

### Apple's Response: Neural TTS with Vocal Effort Control

Claim: Apple Research (Raitio et al., 2022, Interspeech) developed a neural TTS method that models natural vocal effort variation to improve intelligibility in noise, achieving comparable results to known speech intelligibility-enhancing algorithms.[^27^]
Source: Raitio et al. (2022), "Vocal effort modeling in neural TTS for improving the intelligibility of synthetic speech"  
URL: https://www.isca-archive.org/interspeech_2022/raitio22_interspeech.pdf  
Date: 2022  
Excerpt: "The proposed method can improve the intelligibility of synthetic speech with little loss in speech quality."  
Context: This shows that neural TTS can be augmented to address its intelligibility weakness, but requires explicit modeling of vocal effort/spectral tilt—capabilities that concatenative systems achieve inherently through unit selection from clear speech corpora.  
Confidence: high

### Lombard Speech Synthesis (2026)

Claim: A 2026 arXiv paper on Lombard speech synthesis demonstrated that manipulating style embeddings to control Lombardness enhances noise robustness, with neural TTS sometimes achieving lower WER than ground truth in noise.[^28^]
Source: "Lombard Speech Synthesis for Any Voice with Controllable Style Embeddings" (2026)  
URL: https://arxiv.org/html/2601.12966v1  
Date: 2026-01-19  
Excerpt: "Our model often achieves lower WER than GT, which we attribute to recording conditions and accents in the database, while our TTS produces cleaner, native-like speech."  
Context: Neural TTS can now explicitly model Lombard speech adaptations (increased loudness, reduced spectral tilt, slower rate), closing the intelligibility gap with concatenative systems.  
Confidence: medium (preprint)

---

## Emotional and Expressive Speech Synthesis

### Unit Selection for Emotion: CHATR / CHATAKO

Claim: "We propose a new approach to synthesizing emotional speech by a corpus-based concatenative speech synthesis system (ATR CHATR) using speech corpora of emotional speech... a large speech corpus is created per emotion to synthesize speech with the appropriate emotion by simple switching between the emotional corpora."[^29^]
Source: Iida et al. (2002), "A corpus-based speech synthesis system with emotion"  
URL: https://people.cs.pitt.edu/~litman/courses/ads/readings/iida03.pdf  
Date: 2002  
Excerpt: "The acoustic characteristics of each emotional utterance synthesized by our method show clear correlations to those of each corpus. Perceptual experiments... confirmed that our method can synthesize recognizably emotional speech."  
Context: The CHATR approach required separate corpora per emotion (joy, anger, sadness for male and female speakers), illustrating the scalability challenge of concatenative emotional synthesis.  
Confidence: high

### The Unit Selection vs. HMM Trade-off for Emotion

Claim: "Although the HMM method produced significantly better neutral speech, synthetic emotional speech generated from HMMs and from unit selection has comparable speech quality... Synthetic speech produced using unit selection has better emotional strength scores than when using the HMM method."[^30^]
Source: Barra-Chicote et al. (2009/2010), "Analysis of Statistical Parametric and Unit Selection Speech Synthesis Systems Applied to Emotional Speech"  
URL: https://hal.science/hal-00627926/document  
Date: 2010 (published Speech Communication)  
Excerpt: "For emotions that are characterized by both spectral and prosodic components, synthetic speech using unit selection is more accurately identified. When emotions are mainly characterized by the prosodic components, HMM-based synthetic speech is more accurately identified."  
Context: This landmark comparative study concluded that unit selection needs improved prosodic modeling, while HMM needs improved spectral modeling for emotional speech.  
Confidence: high

Claim: "The main drawback of concatenative methods such as unit selection is that the technique requires a large speech database... To build a system capable of generating emotional speech would require a large database for each of an immense variety of emotions, since this method cannot generalise or interpolate emotions."[^31^]
Source: Barra-Chicote et al. (2010)  
URL: https://hal.science/hal-00627926/document  
Date: 2010  
Excerpt: "This would be expensive. To work around this problem, some researchers have attempted to incorporate prosodic or phonologic strategies into unit selection."  
Context: The inability of pure unit selection to interpolate between emotions is a fundamental limitation that HMM-based approaches address through adaptation and interpolation.  
Confidence: high

### Alan Black on Unit Selection and Emotional Speech (2003)

Claim: "Unit selection and emotional speech" was presented at Eurospeech 2003, exploring how unit selection could be extended for emotional expression.[^32^]
Source: Black (2003), Eurospeech 2003  
URL: https://www.isca-archive.org/eurospeech_2003/black03_eurospeech.html  
Date: 2003  
Excerpt: Cited extensively in emotional speech synthesis literature as foundational work on extending unit selection for emotions.  
Context: Black's work at CMU/CSTR established the theoretical basis for emotional unit selection, influencing subsequent systems including the SEV corpus evaluation.  
Confidence: high

---

## Cross-Domain Hybrids: Music + Speech

### Talkapiller: IRCAM's Artistic Speech Synthesis

Talkapiller, developed at IRCAM by Grégory Beller and Diemo Schwarz (ca. 2003), adapted the Caterpillar musical concatenative synthesis system for artistic text-to-speech synthesis.

Claim: "The derived project Talkapillar adapted the Caterpillar system for artistic text-to-speech synthesis by adding specialised phonetic and phonologic descriptors. The goal here is different from fully automatic text-to-speech synthesis: highest speech quality is needed (concerning both sound and expressiveness), manual refinement is allowed."[^33^]
Source: Schwarz (2006), "Concatenative Sound Synthesis"  
URL: http://articles.ircam.fr/textes/Schwarz06b/index.pdf  
Date: 2006  
Excerpt: "The role of Talkapillar is to give the highest possible automatic support for human decisions and synthesis control, and to select a number of well matching units in a very large base... according to high level linguistic descriptors, which reliably predict the low-level acoustic characteristics... and emotional and expressive descriptors."  
Context: Talkapiller inverted the typical TTS paradigm: rather than fully automatic synthesis, it provided intelligent assistance for human artistic control of speech synthesis.  
Confidence: high

Claim: Talkapiller allowed "hybrid concatenation between music and speech by mixing speech and music target specifications and databases, and is applicable to descriptor-driven or context-sensitive voice effects."[^34^]
Source: Beller (2004, 2005), cited in Schwarz (2006)  
URL: http://articles.ircam.fr/textes/Schwarz06b/index.pdf  
Date: 2006  
Excerpt: "In a further development, this system now allows hybrid concatenation between music and speech by mixing speech and music target specifications and databases."  
Context: This represents perhaps the earliest explicit cross-domain hybrid between musical and speech concatenative synthesis.  
Confidence: high

### The Beller-Schwarz-Hueber-Rodet Hybrid System (2005)

Claim: "We describe a concatenative synthesis system which was first designed for a realistic synthesis of melodic phrases. It has since been augmented to become an experimental TTS (Text-to-Speech) synthesizer. Today, it is able to realize hybrid synthesis involving speech segments and musical excerpts coming from any recording imported in its database."[^35^]
Source: Beller, Schwarz, Hueber, Rodet (2005), JIM 2005  
URL: http://recherche.ircam.fr/anasyn/schwarz/publications/jim2005/BellerSchwarzHueberRodet_JIM2005_hybrid-concatenation-between-music-and-speech.pdf  
Date: 2005  
Excerpt: "The system can also synthesize sentences with different voices, sentences with musical sounds, melodic phrases with speech segments and generate compositional material from specific intonation patterns using a prosodic pattern extractor."  
Context: This IRCAM system explicitly bridged the music/speech divide, using the same unit selection infrastructure for both domains.  
Confidence: high

### Caterpillar → CataRT: Musical Concatenative Synthesis Heritage

Claim: "Caterpillar performs non real-time data-driven concatenative musical sound synthesis from large heterogeneous sound databases... The unit selection algorithm is a Viterbi path-search algorithm, which finds the globally optimal sequence of database units that best match the given target units using two cost functions: target cost and concatenation cost."[^36^]
Source: Schwarz (2003/2006), DAFx / Concatenative Sound Synthesis  
URL: http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf  
Date: 2006  
Excerpt: "Units are segmented by automatic alignment of music with its score for instrument corpora, and by blind segmentation for free and re-synthesis. The descriptors are based on the MPEG-7 low-level descriptor set, plus descriptors derived from the score and the sound class."  
Context: The Caterpillar/CataRT systems use the EXACT same mathematical framework (target cost + concatenation cost + Viterbi search) as Hunt & Black's speech synthesis, but with music-specific descriptors (pitch, brilliance, noisiness, spectral flux).  
Confidence: high

Claim: "CataRT's model is a multi-dimensional space of descriptors, populated by the sound units. The user controls a target point in a lower-dimensional projection of that space with a selection radius around it... The generic distance measure is a Euclidean distance on the two chosen descriptors, normalised over the corpus, i.e. a Mahalanobis distance."[^37^]
Source: Schwarz et al. (2008), JIM 2008  
URL: http://jim.afim-asso.org/jim08/upload/05_Schwarz_catart-jim2008-final.pdf  
Date: 2008  
Excerpt: "Explorative real-time synthesis from heterogeneous sound databases allows a sound composer to exploit the richness of detail of recorded sound while retaining efficient control of the acoustic result by using perceptually meaningful descriptors."  
Context: CataRT's Mahalanobis-distance-based selection in descriptor space and real-time gestural control represent capabilities largely absent from speech synthesis systems.  
Confidence: high

---

## Tensions, Counter-Narratives, and Trade-offs

### The Naturalness vs. Intelligibility Trade-off

The central tension in modern TTS is between neural systems (more natural, less intelligible in noise) and concatenative systems (less natural, more intelligible in noise). This mirrors the human speech "clear vs. casual" continuum.

Claim: "This finding suggests that neural TTS, while increasingly naturalistic, may actually reduce listeners ability to understand speech from a modern voice-AI system, if its being used in the presence of competing noise (e.g., a fan, multiple background talkers)."[^38^]
Source: Cohn & Zellou (2020)  
URL: https://www.isca-archive.org/interspeech_2020/cohn20_interspeech.pdf  
Date: 2020  
Excerpt: "At the same time, this finding counters prior work where increased coarticulation has been shown to improve speech-in-noise perception for TTS voices."  
Context: The contradiction with prior work suggests the synthesis method (formant-based vs. neural) matters critically—neural TTS's coarticulation is different in kind from engineered coarticulation.  
Confidence: high

### The Flexibility vs. Naturalness Trade-off

Claim: Statistical parametric synthesis (HTS) is "smooth & stable, small footprint, language independent, easy to change style & emotions" but suffers from "buzzy, muffled speech" due to vocoding and over-smoothing. Unit selection offers "high quality (but sometimes discontinuous), difficult to change its voice characteristics."[^39^]
Source: Black, Zen, Tokuda (2009), "Statistical Parametric Speech Synthesis" tutorial  
URL: https://pdfs.semanticscholar.org/138c/c7756e3c220b8f7af468067fb71f749c5f97.pdf  
Date: 2009  
Excerpt: "Unit selection synthesis: Select appropriate units from speech database. High quality (but sometimes discontinuous). Difficult to change its voice characteristics. Statistical parametric synthesis (SPS): Generate speech parameters from statistics. Vocoded (but smooth & stable). Easy to change voice characteristics."  
Context: This trade-off matrix is the fundamental design space of corpus-based speech synthesis, motivating hybrid approaches.  
Confidence: high

### Data Requirements: The Scalability Challenge

Claim: "The unit selection method is based on selecting and concatenating units of natural speech from the available corpus... If there is more than one instance of each unit spoken in different styles, the system can choose the sequence of units that best conforms to desired prosody and has the least audible joins."[^40^]
Source: Pobar et al. (2012)  
URL: https://www.nnw.cz/doi/2012/NNW.2012.22.026.pdf  
Date: 2012  
Excerpt: "Currently two different corpus based methods dominate in speech synthesis research."  
Context: Unit selection's quality scales with database size and coverage, making it expensive for new languages, speakers, or styles. Neural TTS also requires substantial data (Tacotron 2 needs tens of hours; VALL-E uses 60,000 hours), but generalizes better across speakers via zero-shot transfer.  
Confidence: high

### The Blizzard Challenge: Objective Benchmarking

The Blizzard Challenge (since 2005) has provided systematic evaluation of synthesis methods on common datasets.

Claim: "The annual Blizzard Challenges, run since 2005, provide a clear picture of the performance of various corpus-based speech synthesis techniques (e.g., concatenative, HMM-based or hybrid) for a normal neutral reading style. However, it is not well understood how well these approaches work for emotional or expressive speech."[^41^]
Source: Barra-Chicote et al. (2010)  
URL: https://hal.science/hal-00627926/document  
Date: 2010  
Excerpt: "One of the major problems in extending the investigation of speech synthesis to emotional speech is that of data collection."  
Context: The Blizzard Challenge historically showed unit selection outperforming HMM on naturalness and speaker similarity for neutral speech, but emotional speech evaluation remains underdeveloped.  
Confidence: high

Claim: "The IIM-USTC speech synthesis system for Blizzard Challenge 2019... A hidden Markov model (HMM) based unit selection system was built with improvements in back-end acoustic modeling."[^42^]
Source: Shi et al. (2019), Blizzard Challenge 2019  
URL: http://festvox.org/blizzard/bc2019/IIM_blizzardchallenge2019.pdf  
Date: 2019  
Excerpt: "Two models were built for unit selection, an LSTM-RNN based acoustic model was built and the hidden layer was adopted as context embedding feature, a DNN based unit embedding model was built and the unit vector was adopted as phone unit feature."  
Context: Modern hybrid systems (LSTM-RNN + DNN embeddings guiding unit selection) represent the convergence of neural and concatenative approaches.  
Confidence: high

---

## What Music Synthesis Teaches Speech Synthesis

### 1. Heterogeneous Corpora and Descriptor-Rich Navigation

Musical concatenative synthesis (CataRT) operates on heterogeneous corpora mixing instruments, environmental sounds, voice, and synthetic sounds. Speech synthesis traditionally uses homogeneous single-speaker corpora.

Claim: "With corpora with mixed sources, such as environmental noises, voice, and synthetic sounds, interesting overlaps in the descriptor space occur and can be exploited."[^43^]
Source: Schwarz (2006/2008)  
URL: http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf  
Date: 2006  
Excerpt: "Usually, the units group around several clusters. With corpora with mixed sources, such as train and other environmental noises, voice, and synthetic sounds, interesting overlaps in the descriptor space occur and can be exploited."  
Context: Speech synthesis could benefit from intentionally heterogeneous corpora (multiple speakers, speaking styles, noise conditions) to enable richer stylistic navigation.  
Confidence: medium (speculative application)

### 2. Real-Time Interactive Exploration

Claim: "CATART allows to explore the corpus interactively or via a written target score, to resynthesis an audio file or live input with the source sounds."[^44^]
Source: Schwarz et al. (2006), DAFx 2006  
URL: http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf  
Date: 2006  
Excerpt: "CataRT allows to explore the corpus interactively or via a target sequencer, to resynthesise an audio file or live input with the source sounds, or to experiment with expressive speech synthesis and gestural control."  
Context: Real-time interactive TTS interfaces—where users navigate a descriptor space of voice characteristics—have no commercial equivalent. The concept of "playing" a voice corpus like an instrument is unexplored in speech synthesis.  
Confidence: medium

### 3. Cross-Corpus Selection and Morphing

Claim: "Cross-selection and interpolation. The selection target can be applied from a different corpus, or from live input, thus allowing to extract and apply certain sound characteristics from one corpus to another, and morphing between distinct sound corpora."[^45^]
Source: Schwarz (2008), JIM 2008  
URL: http://jim.afim-asso.org/jim08/upload/05_Schwarz_catart-jim2008-final.pdf  
Date: 2008  
Excerpt: "Cross-selection and interpolation... The selection target can be applied from a different corpus, or from live input, thus allowing to extract and apply certain sound characteristics from one corpus to another."  
Context: Cross-corpus voice morphing—blending characteristics from multiple speakers or styles—is precisely the capability that neural TTS achieves through speaker embedding interpolation, but musical systems achieve through explicit descriptor-based selection.  
Confidence: medium

### 4. Mahalanobis Distance and Perceptual Descriptor Weighting

Claim: CataRT uses "a Mahalanobis distance, in order to avoid distortions between different distances because of the different ranges of the values."[^46^]
Source: Schwarz (2008)  
URL: http://jim.afim-asso.org/jim08/upload/05_Schwarz_catart-jim2008-final.pdf  
Date: 2008  
Excerpt: "The generic distance measure is a Euclidean distance on the two chosen descriptors, normalised over the corpus, i.e. a Mahalanobis distance."  
Context: Speech synthesis target costs typically use hand-tuned weights rather than data-normalized distance measures. Mahalanobis normalization could improve automated target cost design.  
Confidence: medium

---

## What Speech Synthesis Teaches Music Synthesis

### 1. Rigorous Cost Function Optimization

Speech synthesis has developed sophisticated methods for learning and optimizing cost function weights from perceptual data.

Claim: "We trained a classifier on human perceptual judgements of synthetic speech... A/B preference tests showed that the classifier-based target cost, which was learned completely automatically from modest amounts of perceptual data, is almost as good as our carefully-and expertly-tuned standard target cost."[^47^]
Source: Strom & King (2010)  
URL: https://www.isca-archive.org/interspeech_2010/strom10_interspeech.html  
Date: 2010  
Excerpt: "We synthesised 145,137 short sentences with the target cost switched off... We then selected the 7,200 sentences with the best joins and asked 60 listeners to judge them."  
Context: Musical concatenative synthesis could adopt similar perceptual-data-driven approaches to optimize descriptor weights and selection criteria.  
Confidence: medium

### 2. Context-Dependent Phone Modeling

Claim: "Context-dependent phones such as diphones (pairs of phones) or triphones (phone triplets) are therefore utilized" to solve coarticulation in concatenative synthesis.[^48^]
Source: Aalto Speech Processing Book  
URL: https://speechprocessingbook.aalto.fi/Synthesis/Concatenative_speech_synthesis.html  
Date: N/A  
Excerpt: "Context-dependent phones such as diphones (pairs of phones) or triphones (phone triplets) are therefore utilized."  
Context: Musical concatenative synthesis uses primarily fixed-size grains or note-sized units; context-dependent unit selection (considering neighboring musical context) is underexplored.  
Confidence: medium

### 3. Hybrid Synthesis: Combining Statistical and Concatenative Strengths

Claim: "Hybrid synthesis—robustness and learning-from-data + waveform concatenation."[^49^]
Source: King (2016), "Hybrid Speech Synthesis" lecture  
URL: https://speech.zone/media/images/Simon_King_Crete2016_4_hybrid_speech_synthesis_for_publication.pdf  
Date: 2016  
Excerpt: "HMM or DNN synthesis: flexible, somewhat robust to labelling errors, but limited in naturalness by the vocoder. Unit selection: potentially excellent naturalness, but fragile... Hybrid synthesis: robustness and learning-from-data + waveform concatenation."  
Context: The trajectory tiling approach (Microsoft Research, Qian et al. 2013) and Multiform synthesis (Nuance) explicitly combine statistical parameter generation with unit selection waveform concatenation—an approach that could be applied to musical synthesis.  
Confidence: high

Claim: "The HMM trajectory tiling (HTT) system... uses stable regions of natural units to improve the statistically generated parameters... The naturalness of HTT is comparable to that of unit selection, and its intelligibility is comparable to that of HMMSS and the original speech."[^50^]
Source: Gonzalvo et al. (2009), Interspeech  
URL: https://www.isca-archive.org/interspeech_2009/gonzalvo09_interspeech.html  
Date: 2009  
Excerpt: "This paper presents an HMM-driven hybrid speech synthesis approach in which unit selection concatenative synthesis is used to improve the quality of the statistical system using a Local Minimum Generation Error (LMGE) during the synthesis stage."  
Context: HTT explicitly uses HMM-generated trajectories as target costs for unit selection—exactly the kind of principled hybrid that musical systems could emulate.  
Confidence: high

### 4. Automatic Segmentation and Alignment

Claim: "Whistler uses an automatic procedure to configure and generate the synthesis units directly from any recording database... Whistler uses decision-tree clustered phone-based units."[^51^]
Source: Plumpe et al. (1998), Microsoft Research  
URL: https://www.microsoft.com/en-us/research/wp-content/uploads/1998/12/1998-plumpe-icslp.pdf  
Date: 1998  
Excerpt: "Whistler is a concatenative synthesizer, using units that are segmented by Microsoft's speech recognition engine Whisper... The smoothing technique uses a rigorous probabilistic framework backed up with automatically generated statistics to smooth the spectrum of the vocal tract filter across unit boundaries."  
Context: Speech synthesis developed fully automatic voice building pipelines (Whistler, FestVox) that could inform musical corpus building tools.  
Confidence: high

---

## Concrete Examples and Implementations

### Speech Synthesis Systems
| System | Institution | Year | Method | Status |
|--------|-------------|------|--------|--------|
| KlattTalk / DECtalk | MIT/DEC | 1983 | Formant synthesis | Historic |
| PSOLA diphone | CNET (Moulines & Charpentier) | 1990 | Diphone concatenation | Historic |
| CHATR | ATR (Hunt, Black, Campbell) | 1996+ | Unit selection | Research |
| Festival / Multisyn | CSTR/CMU (Black, Taylor, King) | 1998+ | Diphone + Unit selection | Open source active |
| HTS | Nitech (Tokuda, Zen) | 2002+ | HMM parametric | Open source active |
| Whistler | Microsoft (Plumpe) | 1998 | Auto unit selection | Research |
| MaryTTS | DFKI | 2000s+ | Multi-method | Open source |
| WaveNet | DeepMind (van den Oord) | 2016 | Neural raw waveform | Production (Google) |
| Tacotron / Tacotron 2 | Google (Wang, Shen) | 2017–2018 | End-to-end neural | Production |
| Deep Voice | Baidu (Arik) | 2017 | Multi-component neural | Research |
| FastSpeech / FastSpeech 2 | Microsoft (Ren et al.) | 2019–2020 | Non-autoregressive neural | Production |
| VALL-E / VALL-E 2 | Microsoft (Wang et al.) | 2023–2024 | Neural codec LM | Research |
| Amazon Polly NTTS | Amazon | 2019+ | Neural TTS | Commercial |
| ElevenLabs | ElevenLabs | 2022+ | Neural TTS | Commercial ($3.3B) |
| Vocal Effort TTS | Apple (Raitio et al.) | 2022 | Neural + Lombard | Production |

### Musical Concatenative Systems
| System | Institution | Year | Method | Status |
|--------|-------------|------|--------|--------|
| Caterpillar | IRCAM (Schwarz) | 2000 | Non-realtime CBCS | Research |
| CataRT | IRCAM (Schwarz, Beller) | 2005+ | Real-time CBCS | Open source (GPL) |
| Talkapiller | IRCAM (Beller, Schwarz) | 2003 | Artistic TTS | Research |
| Hybrid Music/Speech | IRCAM (Beller et al.) | 2005 | Cross-domain hybrid | Research |
| Musical Mosaicing | Zils & Pachet | 2001 | CSP unit selection | Research |
| MoSievius | Lazier & Cook | 2003 | Real-time mosaicing | Research |
| Ringomatic | Aucouturier & Pachet | 2005 | Drum constraint sat. | Research |

---

## Conclusion and Future Directions

### Summary of Key Findings

1. **Neural TTS has commercially "won"** but concatenative synthesis retains unique advantages: superior intelligibility in noise (Cohn & Zellou 2020), deterministic output, and lower computational requirements for simple deployments.

2. **The intelligibility paradox** (neural = more natural but less intelligible in noise) is the most important cross-domain finding. It parallels the human "clear vs. casual speech" continuum and has safety-critical implications.

3. **Cross-domain hybrids** (IRCAM's Talkapiller, Beller et al. 2005) demonstrate that music and speech synthesis can share unit selection infrastructure, descriptors, and corpora.

4. **Emotional speech synthesis** reveals complementary strengths: unit selection has better emotional strength and spectral fidelity; HMM has better prosodic control and interpolation capabilities.

5. **Musical concatenative synthesis** teaches speech synthesis about: heterogeneous corpora, real-time interactive exploration, cross-corpus morphing, Mahalanobis descriptor weighting, and gestural control.

6. **Speech synthesis** teaches musical concatenative synthesis about: perceptually learned target costs, context-dependent unit modeling, hybrid statistical/concatenative approaches (trajectory tiling), and automatic segmentation pipelines.

### Future Directions (2024–2026+)

- **Neural-guided unit selection**: Using neural network embeddings (DNN, LSTM) as features in traditional unit selection cost functions, as demonstrated in Blizzard Challenge 2019 entries.
- **Codec-based concatenative hybrids**: Neural audio codecs (EnCodec, Mimi) create discrete token spaces where concatenative selection and neural generation can coexist.
- **Controllable vocal effort in neural TTS**: Apple's 2022 work and 2026 Lombard TTS systems show neural approaches can learn to be intelligible in noise.
- **Universal audio language models**: Models like AudioLM, VALL-E, and MusicGen operate on the same token space across speech, music, and sound effects—realizing the cross-domain vision first explored at IRCAM.
- **Real-time artistic TTS**: The Talkapiller concept of interactive, human-assisted speech synthesis remains unexplored commercially.

---

## References (Citations)

[^1^]: Moulines, E. & Charpentier, F. (1990). "Pitch-synchronous waveform processing techniques for text-to-speech synthesis using diphones." Speech Communication, 9(5-6), 453-467.
[^2^]: Illinois ECE 420 Course Notes, "Pitch-Synchronous Waveform Processing."
[^3^]: Hunt, A.J. & Black, A.W. (1996). "Unit selection in a concatenative speech synthesis system using a large speech database." ICASSP 1996, vol. 1, 373-376.
[^4^]: Aalto Speech Processing Book, Chapter 9.1: Concatenative Speech Synthesis.
[^5^]: Zen, H., Nose, T., Yamagishi, J., et al. (2007). "The HMM-based speech synthesis system (HTS) version 2.0." SSW 2007.
[^6^]: Black, A.W., Zen, H., & Tokuda, K. (2009). "Statistical Parametric Speech Synthesis." Tutorial.
[^7^]: Anve Voice (2026). "Neural TTS vs Concatenative TTS."
[^8^]: BlockSentient. "Amazon Polly - Tool Briefing."
[^9^]: Microsoft Research. "VALL-E: Neural Codec Language Models."
[^10^]: Microsoft Research. "VALL-E 2."
[^11^]: "How Open is Open TTS? A Practical Evaluation of Open Source TTS Tools." arXiv 2026.
[^12^]: ShadeCoder (2026). "Concatenative TTS: A Comprehensive Guide for 2025."
[^13^]: Vapi.ai (2025). "How to Create Natural Audio Using Concatenative Synthesis."
[^14^]: Pobar, M., Martinčić-Ipšić, S., & Ipšić, I. (2012). "Optimization of cost function weights for unit selection speech synthesis using speech recognition." Neural Network World.
[^15^]: Strom, V. & King, S. (2010). "A classifier-based target cost for unit selection speech synthesis trained on perceptual data." Interspeech 2010.
[^16^]: Pobar et al. (2012). Neural Network World.
[^17^]: Zen et al. (2007). SSW 2007 / IEEE.
[^18^]: King, S. (2010). "A beginners' guide to statistical parametric speech synthesis." CSTR.
[^19^]: Black, Zen, Tokuda (2009). Statistical Parametric Speech Synthesis tutorial.
[^20^]: van den Oord, A., et al. (2016). "WaveNet: A Generative Model for Raw Audio." arXiv:1609.03499.
[^21^]: Wang, Y., et al. (2017). "Tacotron: Towards End-to-End Speech Synthesis." arXiv:1703.10135.
[^22^]: TTS Library. "History of text-to-speech technology." 2026.
[^23^]: Arik, S.O., et al. (2017). "Deep Voice: Real-time Neural Text-to-Speech." arXiv:1702.07825.
[^24^]: Cohn, M. & Zellou, G. (2020). "Perception of Concatenative vs. Neural Text-To-Speech (TTS)." Interspeech 2020.
[^25^]: Cohn & Zellou (2020). Full paper.
[^26^]: Cohn & Zellou (2020). Interspeech 2020.
[^27^]: Raitio, T., et al. (2022). "Vocal effort modeling in neural TTS for improving the intelligibility of synthetic speech in the presence of noise." Interspeech 2022.
[^28^]: "Lombard Speech Synthesis for Any Voice with Controllable Style Embeddings." arXiv 2026.
[^29^]: Iida, A., Campbell, N., Higuchi, F., & Yasumura, M. (2002). "A corpus-based speech synthesis system with emotion."
[^30^]: Barra-Chicote, R., et al. (2010). "Analysis of Statistical Parametric and Unit Selection Speech Synthesis Systems Applied to Emotional Speech." Speech Communication.
[^31^]: Barra-Chicote et al. (2010).
[^32^]: Black, A.W. (2003). "Unit selection and emotional speech." Eurospeech 2003.
[^33^]: Schwarz, D. (2006). "Concatenative Sound Synthesis." IRCAM.
[^34^]: Beller, G. (2004, 2005). Talkapiller development.
[^35^]: Beller, G., Schwarz, D., Hueber, T., & Rodet, X. (2005). "A hybrid concatenative synthesis system on the intersection of music and speech." JIM 2005.
[^36^]: Schwarz, D. (2006). "Real-Time Corpus-Based Concatenative Synthesis with CataRT." DAFx 2006.
[^37^]: Schwarz, D. et al. (2008). "Principles and Applications of Interactive Corpus-Based Concatenative Synthesis." JIM 2008.
[^38^]: Cohn & Zellou (2020).
[^39^]: Black, Zen, Tokuda (2009).
[^40^]: Pobar et al. (2012).
[^41^]: Barra-Chicote et al. (2010).
[^42^]: Shi, H., et al. (2019). "The IIM System for Blizzard Challenge 2019."
[^43^]: Schwarz (2006). DAFx 2006.
[^44^]: Schwarz et al. (2006).
[^45^]: Schwarz (2008). JIM 2008.
[^46^]: Schwarz (2008).
[^47^]: Strom & King (2010).
[^48^]: Aalto Speech Processing Book.
[^49^]: King, S. (2016). "Hybrid Speech Synthesis." Lecture.
[^50^]: Gonzalvo, X., et al. (2009). "Local minimum generation error criterion for hybrid HMM speech synthesis." Interspeech 2009.
[^51^]: Plumpe, M.D., et al. (1998). "HMM-Based Smoothing For Concatenative Speech Synthesis." Microsoft Research.

---

*Research compiled: April 2026*  
*Searches conducted: 22+ independent web searches across academic papers, institutional repositories, official documentation, and authoritative technical sources.*
