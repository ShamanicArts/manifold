# Dimension 09: Neural Concatenative Synthesis & Deep Learning Hybrids

## Research Report — April 2026

**Scope**: CoSaRef (concatenative synthesis + diffusion refinement, 2024). Differentiable concatenative synthesis. Neural unit selection networks. VAE-based latent corpus spaces for navigation. RAVE (real-time audio variational autoencoder). DDSP and timbre transfer. Using neural vocoders (WaveNet, HiFi-GAN) to smooth concatenative output. Neural audio mosaicing research. End-to-end learned similarity for unit selection. Generative models for corpus expansion. Hybrid neural-DSP architectures.

---

## 1. Executive Summary

The intersection of deep learning with corpus-based concatenative synthesis has emerged as one of the most active frontiers in audio synthesis research (2024–2026). This dimension covers a spectrum from **neural refinement of concatenative output** (CoSaRef, 2024) through **fully neural corpus navigation** (Latent Granular Resynthesis, 2025) to **differentiable DSP hybrids** (DDSP, 2020; AFTER, 2024) and **neural-guided unit selection** (Siri TTS, 2017; kNN-SVC, 2025). The field is characterized by a productive tension between two paradigms: (1) preserving the naturalness and timbral fidelity of waveform concatenation while mitigating its discontinuity artifacts using neural post-processing, and (2) replacing explicit corpus search with learned latent-space similarity, enabling entirely new creative workflows.

Key developments in the current period include:
- **CoSaRef** (Take & Akama, Sony CSL, 2024) demonstrating that concatenative synthesis + diffusion refinement outperforms pure MIDI-supervised methods while requiring no paired training data.
- **kNN-SVC** (Shao et al., UCSD, 2025) introducing neural concatenative synthesis with learned concatenation smoothness optimization for singing voice conversion.
- **Latent Granular Resynthesis** (Tokui & Baker, Neutone/Qosmo, 2025) using neural audio codec latent spaces to perform training-free granular concatenation with implicit interpolation.
- **AFTER** (Demerlé et al., IRCAM, 2024) combining RAVE-based neural codecs with conditional latent diffusion for real-time polyphonic audio synthesis.
- **The Concatenator** (Tralie & Cantil, 2024) applying Bayesian particle filtering to real-time concatenative musaicing with computational complexity independent of corpus size.

---

## 2. Current State (2024–2026)

### 2.1 CoSaRef: Concatenative Synthesis + Diffusion Refinement

Claim: "CoSaRef first performs concatenative synthesis based on MIDI inputs and then refines the resulting audio into realistic tracks using a diffusion-based deep generative model trained on audio-only datasets."[^1^]
Source: Annotation-Free MIDI-to-Audio Synthesis via Concatenative Synthesis and Generative Refinement
URL: https://arxiv.org/abs/2410.16785
Date: 2024-10-22 (v2: 2025-06-11)
Excerpt: "We propose CoSaRef, a MIDI-to-audio synthesis method that does not require MIDI-audio paired datasets. CoSaRef first generates a synthetic audio track using concatenative synthesis based on MIDI input, then refines it with a diffusion-based deep generative model trained on datasets without MIDI annotations."
Context: From Sony Computer Science Laboratories, Tokyo. The key insight is using SDEdit/ZETA zero-shot editing techniques on latent diffusion models to transform synthetic concatenative audio into realistic output without requiring aligned MIDI-audio training pairs.
Confidence: high

Claim: "Despite not being supervised on MIDI annotation, CoSaRef's performance was superior to a state-of-the-art timbre-controllable method requiring MIDI-audio paired data for supervised training in both objective and subjective evaluation."[^2^]
Source: CoSaRef v2 (arXiv:2410.16785v2)
URL: https://arxiv.org/html/2410.16785v2
Date: 2025-06-11
Excerpt: "Furthermore, we evaluated CoSaRef using a DAGM fine-tuned on the target instrumental audio. The results showed that CoSaRef could produce realistic audio with nuanced similarities to the target performance while remaining faithful to the input MIDI."
Context: Uses SAOpen (Stable Audio Open) as the backbone latent diffusion model, fine-tuned on audio-only datasets. The concatenative sampler uses NSynth note samples.
Confidence: high

### 2.2 Neural Concatenative Synthesis with Smoothness Optimization

Claim: "We design a novel distance function that incorporates the cost of temporal concatenation, and we use it to autoregressively replace temporally unfit candidates. When combining candidates, we further optimize their weights to minimize the concatenation cost, leading to smoother and more perceptually pleasing output."[^3^]
Source: kNN-SVC: Robust Zero-Shot Singing Voice Conversion with Additive Synthesis and Concatenation Smoothness Optimization
URL: https://arxiv.org/abs/2504.05686
Date: 2025-04-08
Excerpt: "The second insight concerns the well-known issue of smoothness in concatenative synthesis. In singing, notes can sustain for several seconds, often representing climactic moments in a piece. However, the frame-by-frame nature of kNN-VC leads to candidates optimized for local fidelity without considering their temporal coherence, resulting in artifacts such as slurring or trembling."
Context: UC San Diego / Stellenbosch University / ERC REACH. Extends kNN-VC by adding (1) additive synthesis for harmonic enhancement and (2) a temporal concatenation cost in the distance metric. Presented at ICASSP 2025.
Confidence: high

Claim: "Concatenative neural synthesis models, such as kNN-VC and RVC, bypass the disentanglement challenge by using non-parametric nearest neighbor regression within a self-supervised learning (SSL) representation space."[^4^]
Source: kNN-SVC (ICASSP 2025 extended abstract)
URL: https://hal.science/hal-05192033v1
Date: 2025
Excerpt: "This approach yields audio with high timbre similarity to the reference speaker while maintaining strong intelligibility."
Context: kNN-VC (Baas et al., Interspeech 2023) showed that complexity is not necessary for voice conversion — just nearest neighbors on WavLM features + HiFi-GAN vocoder.
Confidence: high

### 2.3 Latent Granular Resynthesis using Neural Audio Codecs

Claim: "Our approach creates a 'granular codebook' by encoding a source audio corpus into latent vector segments, then matches each latent grain of a target audio signal to its closest counterpart in the codebook... naturally avoids the discontinuities typical of traditional concatenative synthesis through the codec's implicit interpolation during decoding."[^5^]
Source: Latent Granular Resynthesis using Neural Audio Codecs
URL: https://arxiv.org/abs/2507.19202
Date: 2025-07-25
Excerpt: "This technique requires no model training, works with diverse audio materials, and naturally avoids the discontinuities typical of traditional concatenative synthesis through the codec's implicit interpolation during decoding."
Context: Nao Tokui (Neutone/Qosmo) and Tom Baker, presented as late-breaking demo at ISMIR 2025. Uses pre-trained neural audio codecs (e.g., EnCodec, SoundStream) to create latent codebooks. The grain matching is completely non-autoregressive and can be streamable.
Confidence: high

Claim: "The final upsampling performed by the codec's decoder implicitly interpolates between the grains, ensuring a consistent quality of audio output."[^6^]
Source: Latent Granular Resynthesis (full PDF)
URL: https://arxiv.org/pdf/2507.19202
Date: 2025-07-25
Excerpt: "The final step involves concatenating the selected grain sequence and passing it through the neural audio codec's decoder to generate continuous audio output. This final upsampling performed by the codec's decoder implicitly interpolates between the grains."
Context: Critically different from waveform-domain concatenative synthesis — the neural decoder smooths latent transitions.
Confidence: high

### 2.4 Bayesian Real-Time Concatenative Musaicing

Claim: "We use a particle filter to infer the best hidden corpus states in real-time. Our transition model includes a tunable parameter to control the time-continuity of corpus grains... the computational complexity of the system is independent of the corpus size."[^7^]
Source: The Concatenator: A Bayesian Approach To Real Time Concatenative Musaicing
URL: https://arxiv.org/abs/2411.04366
Date: 2024-11-07
Excerpt: "Unlike Driedger's NMF-based technique, however, we instead use an explicitly Bayesian point of view, where corpus window indices are hidden states and the target audio stream is an observation."
Context: Christopher Tralie (Ursinus College) and Ben Cantil (DataMind Audio). Evaluated with quantitative tests and qualitative artistic evaluation. Scales to corpora that are hours long.
Confidence: high

### 2.5 Neural-Guided Unit Selection in Speech Synthesis

Claim: "We use deep and recurrent mixture density networks (MDNs) to predict target and concatenation distributions and jointly implement the target and concatenation costs in a probabilistic way."[^8^]
Source: Siri On-Device Deep Learning-Guided Unit Selection Text-to-Speech System
URL: https://www.isca-archive.org/interspeech_2017/capes17_interspeech.pdf
Date: 2017 (Interspeech)
Excerpt: "Our on-device TTS system follows the typical unit selection framework, which uses a front-end to produce linguistic features, pre-selection for low latency, statistical model to implement concatenation and target costs for Viterbi search that finds the optimum unit sequence, and waveform concatenation to generate the final synthesized waveform."
Context: Apple's Siri TTS team. Deployed to hundreds of millions of devices. Demonstrates that deep learning can improve traditional unit selection without replacing it entirely. Uses mixture density networks to predict distributions for costs.
Confidence: high

Claim: "The use of deep neural networks in systems LE, HE and NP provides significant improvements over both the baseline (M) and the HMM-driven hybrid system (HP)."[^9^]
Source: Deep Neural Network-guided unit selection synthesis (Merritt et al., ICASSP 2016)
URL: https://www.cstr.ed.ac.uk/downloads/publications/2016/Merritt_ICASSP2016.pdf
Date: 2016
Excerpt: "This demonstrates that the gains found in SPSS systems when moving from HMMs+regression trees to DNNs transfers over to the hybrid unit selections paradigm."
Context: University of Edinburgh / CSTR. Compared HMM-guided vs DNN-guided hybrid unit selection in Festival's Multisyn framework. DNN context embeddings (from bottleneck layers) outperformed HMM-generated speech parameters.
Confidence: high

### 2.6 SelectTTS: Frame Selection for Multi-Speaker TTS

Claim: "SelectTTS selects appropriate frames from the target speaker and decodes them using frame-level self-supervised learning (SSL) features... achieves better speaker similarity performance than SOTA baselines XTTS-v2 and VALL-E with over an 8x reduction in model parameters and a 270x reduction in training data."[^10^]
Source: Synthesizing Anyone's Voice via Discrete Unit-Based Frame Selection
URL: https://arxiv.org/abs/2408.17432
Date: 2024-08-30 (revised 2025-04-30)
Excerpt: "With SelectTTS, we introduce a new paradigm of frame selection-based multi-speaker TTS that directly utilizes frames from unseen target speakers to clone their voice."
Context: UT Dallas / Johns Hopkins / NUS. Novel frame selection algorithms: sub-sequence matching and inverse k-means sampling. Uses HiFi-GAN vocoder fine-tuned on selected frames.
Confidence: high

---

## 3. Key Neural-DSP Hybrid Architectures

### 3.1 RAVE: Real-Time Audio Variational Autoencoder

Claim: "We introduce a Realtime Audio Variational autoEncoder (RAVE) allowing both fast and high-quality audio waveform synthesis... our model is the first able to generate 48kHz audio signals, while simultaneously running 20 times faster than real-time on a standard laptop CPU."[^11^]
Source: RAVE: A variational autoencoder for fast and high-quality neural audio synthesis
URL: https://arxiv.org/abs/2111.05011
Date: 2021-11-09
Excerpt: "We introduce a novel two-stage training procedure, namely representation learning and adversarial fine-tuning. We show that using a post-training analysis of the latent space allows a direct control between the reconstruction fidelity and the representation compactness."
Context: Antoine Caillon and Philippe Esling, IRCAM / ACIDS. Core technology for real-time neural audio synthesis. Uses multi-band pseudo-QMF decomposition, VAE with spectral loss, then adversarial fine-tuning. Latent codes analyzed via SVD for controllable compression.
Confidence: high

Claim: "RAVE was originally trained with non-causal (zero) padding... For real-time processing, a post-training causal reconfiguration is applied... This enables the offline-trained network to operate buffer-wise in real time."[^12^]
Source: RAVE technical summary (Emergent Mind)
URL: https://www.emergentmind.com/topics/real-time-audio-variational-autoencoder-rave
Date: 2025
Excerpt: "Cumulative and buffering delays are minimized by reducing the encoder's compression ratio, shortening the PQMF filter... bringing overall system latencies below 10 ms with negligible jitter."
Context: IRCAM's nn~ external enables RAVE models to run in Max/MSP and Pure Data for live performance.
Confidence: high

### 3.2 AFTER: Audio Features Transfer and Exploration in Real-time

Claim: "AFTER is a diffusion-based generative model that creates new audio by blending two sources: one audio stream to set the style or timbre, and another input (either audio or MIDI) to shape the structure over time."[^13^]
Source: AFTER GitHub (IRCAM ACIDS)
URL: https://github.com/acids-ircam/AFTER
Date: 2024-11-08
Excerpt: "This repository is a real-time implementation of the research paper 'Combining audio control and style transfer using latent diffusion' by Nils Demerlé, P. Esling, G. Doras, and D. Genova."
Context: AFTER uses RAVE as the neural audio codec and adds conditional latent diffusion for control. Latency 200-500ms. Supports polyphony when trained on polyphonic data. Max for Live and nn~ integration.
Confidence: high

### 3.3 DDSP: Differentiable Digital Signal Processing

Claim: "DDSP employs a neural autoencoder architecture that replaces the conventional waveform generator with modular DSP components... This approach enables high-quality timbre transfer using as little as 10 minutes of training data per instrument."[^14^]
Source: DDSP (Differentiable Digital Signal Processing), finally explained
URL: https://neuralanalog.com/docs/ddsp-model-magenta
Date: 2025
Excerpt: "An RNN (typically a GRU) analyzes input audio to extract fundamental frequency (f0, the pitch) and loudness contours. These low-dimensional control signals capture the essential performance dynamics."
Context: Google's Magenta (Engel et al., 2020). Core paper at ICLR. Combines harmonic additive synthesizer, filtered noise synthesizer, and differentiable reverberator. All components differentiable for end-to-end training.
Confidence: high

Claim: "A review of differentiable digital signal processing for music and speech synthesis... DDSP methods offer a combination of data-driven and parametric characteristics."[^15^]
Source: A Review of Differentiable Digital Signal Processing for Music & Speech Synthesis
URL: https://arxiv.org/abs/2308.15422
Date: 2023-08-29
Excerpt: "The term 'differentiable digital signal processing' describes a family of techniques in which loss function gradients are backpropagated through digital signal processors, facilitating their integration into neural networks."
Context: Hayes, Shier, Fazekas, McPherson, Saitis (Queen Mary / Imperial). Comprehensive survey cataloguing applications to music performance rendering, sound matching, and voice transformation. Identifies optimization pathologies and robustness challenges.
Confidence: high

---

## 4. Historical Evolution

### 4.1 From Unit Selection to Neural Guidance

Claim: "Unit selection in CHATR is based on the two cost functions... the target cost, C^t(u_i,t_i), is an estimate of the difference between a database unit, u_i, and the target, t_i... the concatenation cost, C^c(u_{i-1},u_i), is an estimate of the quality of a join between consecutive units."[^16^]
Source: Unit Selection in a Concatenative Speech Synthesis System Using a Large Speech Database (Hunt & Black, 1996)
URL: https://www.ee.columbia.edu/~dpwe/e6820/papers/HuntB96-speechsynth.pdf
Date: 1996
Excerpt: "The units in a synthesis database can be considered as states in a state transition network in which the state occupancy cost is the distance between a database unit and a target, and the transition cost is an estimate of the quality of concatenation of two consecutive units."
Context: The foundational paper for modern concatenative synthesis. ATR, Japan. Introduced target cost + concatenation cost formulation with Viterbi search. Directly inspired later neural-guided variants.
Confidence: high

Claim: "Diemo Schwarz. Corpus-based concatenative synthesis. IEEE Signal Processing Magazine, 24(2):92-104, March 2007."[^17^]
Source: Musical Applications of Real-Time Corpus-Based Concatenative Synthesis (Schwarz et al., ICMC 2007)
URL: http://articles.ircam.fr/textes/Schwarz07b/index.pdf
Date: 2007
Excerpt: "Corpus-based concatenative synthesis. IEEE Sig. Proc. Mag., 24(2), March 2007."
Context: Diemo Schwarz at IRCAM established the musical/creative branch of concatenative synthesis with CataRT. The 2007 IEEE SPM article is the definitive survey of the field. Distance mapping, descriptor-based navigation, and real-time corpus-based synthesis.
Confidence: high

### 4.2 The Neural Audio Synthesis Revolution

Claim: "We have introduced a WaveNet autoencoder model that captures long term structure without the need for external conditioning and demonstrated its effectiveness on the new NSynth dataset for generative modeling of audio."[^18^]
Source: Neural Audio Synthesis of Musical Notes with WaveNet Autoencoders (Engel et al., 2017)
URL: https://arxiv.org/pdf/1704.01279
Date: 2017
Excerpt: "Our autoencoder removes the need for that external conditioning. It works by taking raw audio waveform as input from which the encoder produces an embedding Z = f(x)."
Context: Google Magenta. NSynth dataset of 306K notes from 1006 instruments. Temporal encoder (30-layer dilated convolutions) + WaveNet decoder. Established that learned latent spaces could capture pitch, dynamics, and timbre for musical notes.
Confidence: high

Claim: "SoundStream relies on a model architecture composed by a fully convolutional encoder/decoder network and a residual vector quantizer, which are trained jointly end-to-end."[^19^]
Source: SoundStream: An End-to-End Neural Audio Codec
URL: https://arxiv.org/abs/2107.03312
Date: 2021-07-07
Excerpt: "By training with structured dropout applied to quantizer layers, a single model can operate across variable bitrates from 3kbps to 18kbps."
Context: Google Research (Zeghidour et al.). Neural audio codec that compresses speech, music, and general audio. Operates at 24kHz. Foundation for later latent-space concatenative approaches.
Confidence: high

### 4.3 Hybrid Speech Synthesis Trajectory

Claim: "Hybrid synthesis — robustness and learning-from-data + waveform concatenation."[^20^]
Source: Hybrid Speech Synthesis (Simon King, University of Edinburgh, 2016)
URL: https://speech.zone/media/images/Simon_King_Crete2016_4_hybrid_speech_synthesis_for_publication.pdf
Date: 2016
Excerpt: "HMM or DNN synthesis: flexible, somewhat robust to labelling errors, but limited in naturalness by the vocoder. Unit selection: potentially excellent naturalness, but fragile. Hybrid synthesis: robustness and learning-from-data + waveform concatenation."
Context: King articulated the hybrid philosophy that has driven industrial TTS for a decade. Microsoft Research's "trajectory tiling" (Qian, Soong & Yan, 2013) and Nuance's "multiform synthesis" are prime examples.
Confidence: high

---

## 5. Key Actors & Stakeholders

### 5.1 Research Institutions & Labs

- **IRCAM (Paris, France)**: ACIDS team led by Philippe Esling. Origin of RAVE, AFTER, CataRT, and extensive work on VAE latent timbre spaces. The `nn~` external for Max/MSP/Pure Data is the primary bridge between neural models and live performance.
- **Sony Computer Science Laboratories (Tokyo)**: Osamu Take and Taketo Akama — CoSaRef (2024), combining concatenative samplers with diffusion refinement.
- **Google Magenta / Brain**: Jesse Engel, Lamtharn Hantrakul, Chenjie Gu, Adam Roberts — DDSP (2020), NSynth (2017). Projects archived as of 2024 but foundational.
- **UC San Diego / ERC REACH**: Shlomo Dubnov's group — kNN-SVC (2025), kNN-VC lineage, neural concatenative synthesis with smoothness optimization.
- **University of Edinburgh / CSTR**: Simon King, Tom Merritt — hybrid unit selection, DNN-guided synthesis.
- **Apple Inc.**: Siri TTS team (Capes et al., 2017) — deployed deep learning-guided unit selection to hundreds of millions of devices.
- **Queen Mary University of London / C4DM**: Ben Hayes, Jordie Shier, György Fazekas, Andrew McPherson — DDSP review, differentiable audio synthesis research.

### 5.2 Open-Source Projects & Tools

- **RAVE** (https://github.com/acids-ircam/rave) — Official implementation, with VST, nn~ integration, Colab training notebooks.
- **AFTER** (https://github.com/acids-ircam/AFTER) — Diffusion-based real-time audio synthesis using RAVE codec.
- **nn~ / nn_tilde** (https://github.com/acids-ircam/nn_tilde) — TorchScript bridge for Max/MSP and Pure Data.
- **kNN-SVC** (https://github.com/SmoothKen/knn-svc) — Robust singing voice conversion with concatenation smoothness.
- **kNN-VC** (https://github.com/bshall/knn-vc) — Zero-shot voice conversion via nearest neighbors.
- **The Concatenator** (DataMind Audio / Christopher Tralie) — Real-time Bayesian concatenative musaicing.
- **Neutone** (https://neutone.ai) — Platform for hosting and distributing neural audio models as VST plugins.
- **DDSP** (Magenta, archived) + **MAWF** (yaboihanoi) — Real-time DDSP at 48kHz.
- **Latent Granular** (https://github.com/naotokui/latentgranular/) — ISMIR 2025 demo for neural codec-based granular resynthesis.

---

## 6. Tensions, Trade-offs & Counter-Narratives

### 6.1 Concatenative vs. Fully Generative: The Naturalness Debate

Claim: "Unit selection typically produces more natural-sounding speech than SPSS, provided the database used has sufficient high quality audio material."[^21^]
Source: Siri On-Device Deep Learning-Guided Unit Selection TTS (Interspeech 2017)
URL: https://www.isca-archive.org/interspeech_2017/capes17_interspeech.pdf
Date: 2017
Excerpt: "Given a sequence of text input, unit selection directly assembles waveform segments to produce synthetic speech, while SPSS predicts synthetic speech from trained acoustic models. Unit selection typically produces more natural-sounding speech than SPSS."
Context: The enduring trade-off: concatenative synthesis preserves naturalness from real recordings but suffers from discontinuities; parametric/neural methods are smooth but can sound synthetic. Hybrid approaches attempt to bridge this gap.
Confidence: high

Claim: "Aggressive signal processing based modification of the segments also often tends to decrease the naturalness of the sound. Straightforward modification of the segments' acoustic parameters (e.g. with vocoding) is not therefore a recommended strategy to overcome the issues of poor unit selection or low quality source data."[^22^]
Source: Concatenative speech synthesis (Aalto University speech processing book)
URL: https://speechprocessingbook.aalto.fi/Synthesis/Concatenative_speech_synthesis.html
Date: N/A
Excerpt: "After the speech units have been concatenated to form the intended utterance, postprocessing techniques can be used to smooth the potential discontinuities in F0, energy and spectrum at the unit boundaries."
Context: The challenge of post-processing: too little = audible joins; too much = loss of naturalness. Neural vocoders (HiFi-GAN) now offer a middle path.
Confidence: high

### 6.2 Data Requirements and Accessibility

Claim: "These training-based methods require substantial time and datasets for each corpus, limiting accessibility, and immediate experimentation."[^23^]
Source: Latent Granular Resynthesis using Neural Audio Codecs
URL: https://arxiv.org/abs/2507.19202
Date: 2025-07-25
Excerpt: "Alternatively, 'The Concatenator' optimises the concatenative synthesis approach using Bayesian inference... but still maintains the characteristic granular sound of waveform-domain concatenation."
Context: A key tension: corpus-specific neural models (RAVE, DDSP) need hours of training data and GPU time. Training-free methods (latent granular, The Concatenator) trade some quality for immediacy.
Confidence: high

### 6.3 Latency vs. Quality in Real-Time Systems

Claim: "Diffusion requires iterative steps (denoising) to generate sound. In the real-time implementation, this typically results in a latency between 200ms and 500ms."[^24^]
Source: AFTER documentation (Neural Analog)
URL: https://neuralanalog.com/docs/after-model-ircam
Date: 2025
Excerpt: "It is 'real-time' in the sense that it generates audio on-the-fly, but it feels more like playing a predictable delay than an instant instrument."
Context: AFTER and CoSaRef use diffusion, which adds latency. RAVE achieves sub-10ms latency. This is a fundamental architectural trade-off between iterative generative refinement and feed-forward synthesis.
Confidence: high

### 6.4 Monophonic vs. Polyphonic Limitations

Claim: "Monophonic DDSP models were trained on single-note instruments and can't generate polyphonic audio. This is because they were trained over monophonic datasets, and the harmonic synthesizer assumes a single fundamental frequency at each time step."[^25^]
Source: DDSP documentation (Neural Analog)
URL: https://neuralanalog.com/docs/ddsp-model-magenta
Date: 2025
Excerpt: "While Engel et al. originally controlled the networks with pitch and loudness, later work extended these models to other forms of input such as higher level expression features and MIDI input."
Context: DDSP's monophonic limitation drove development of polyphonic extensions (Renault et al.'s differentiable piano model, DAFx 2020) and AFTER's polyphonic latent diffusion. Polyphonic DDSP models sum multiple voices in parallel.
Confidence: high

---

## 7. Concrete Implementations & Products

### 7.1 Music & Creative Tools

- **CataRT** (Schwarz et al., IRCAM) — Real-time corpus-based concatenative synthesis with descriptor navigation. Still actively used in composition and performance.
- **nn~ + RAVE** (IRCAM) — Real-time neural audio synthesis in Max/MSP and Pure Data. Used in live electronic music.
- **AFTER** (IRCAM) — Max for Live devices for Ableton Live. Audio-to-audio and MIDI-to-audio timbre transfer via latent diffusion.
- **The Concatenator** (DataMind Audio) — Real-time Bayesian concatenative musaicing for modular synthesis and live performance.
- **Neutone FX** — VST plugin hosting community-trained models (including DDSP and RAVE variants).
- **MAWF** — Free VST/AU delivering DDSP synthesis at 48kHz (website reportedly down as of Nov 2025).

### 7.2 Speech Synthesis Systems

- **Apple Siri TTS** — Hybrid unit selection with deep/recurrent MDN-guided costs. Deployed on-device.
- **SelectTTS** — Lightweight multi-speaker TTS using frame selection from SSL features. 8x fewer parameters than XTTS-v2.
- **kNN-VC / kNN-SVC** — Zero-shot voice/singing conversion using nearest-neighbor retrieval + HiFi-GAN vocoder.
- **RVC (Retrieval-based Voice Conversion)** — Open-source project using top-1 retrieval of voice tokens to condition VITS-like converter.

### 7.3 Research Prototypes

- **CoSaRef** — MIDI-to-audio via concatenative sampler + Stable Audio Open diffusion refinement.
- **Latent Granular Resynthesis** — Training-free creative audio resynthesis using neural codec latent codebooks.
- **Differentiable Piano Model** (Renault, Miguot, Roebel, IRCAM, DAFx 2020) — Polyphonic DDSP for piano.
- **DDSP-Based Neural Waveform Synthesis of Polyphonic Guitar** (DAFx 2024) — Extended DDSP to guitar with multiple voices.

---

## 8. Emerging Directions (2025–2026)

1. **Neural Codec as Concatenative Interpolator**: Latent Granular Resynthesis (2025) demonstrates that neural audio codec decoders can implicitly smooth concatenative transitions, potentially eliminating the discontinuity problem that has plagued concatenative synthesis since its inception.

2. **SSL-Driven Non-Parametric Synthesis**: kNN-VC, SelectTTS, and kNN-SVC show that self-supervised learning representations (WavLM, HuBERT) provide sufficiently structured feature spaces that simple nearest-neighbor retrieval can outperform complex parametric models, with far less training data.

3. **Diffusion as Refinement, Not Generation**: CoSaRef's key insight is using diffusion not to generate audio from scratch, but to refine an existing (concatenative) structural scaffold. This "guided editing" paradigm may generalize to other synthesis tasks.

4. **Real-Time Bayesian Methods**: The Concatenator (2024) proves that probabilistic inference (particle filtering) can achieve real-time concatenative synthesis with corpus-size-independent complexity — a significant algorithmic advance.

5. **Disentanglement via Architecture**: AFTER's adversarial criterion that penalizes pitch information leaking into timbre encoders represents a architectural (rather than purely loss-based) approach to disentanglement — important for controllable synthesis.

---

## 9. Bibliography

[^1^] Take, O., & Akama, T. (2024). Annotation-Free MIDI-to-Audio Synthesis via Concatenative Synthesis and Generative Refinement. arXiv:2410.16785. https://arxiv.org/abs/2410.16785

[^2^] Take, O., & Akama, T. (2025). Annotation-Free MIDI-to-Audio Synthesis via Concatenative Synthesis and Generative Refinement (v2). arXiv:2410.16785v2. https://arxiv.org/html/2410.16785v2

[^3^] Shao, K., Chen, K., Baas, M., & Dubnov, S. (2025). kNN-SVC: Robust Zero-Shot Singing Voice Conversion with Additive Synthesis and Concatenation Smoothness Optimization. arXiv:2504.05686. https://arxiv.org/abs/2504.05686

[^4^] Shao, K., et al. (2025). kNN-SVC (ICASSP 2025 extended abstract). HAL: hal-05192033. https://hal.science/hal-05192033v1

[^5^] Tokui, N., & Baker, T. (2025). Latent Granular Resynthesis using Neural Audio Codecs. arXiv:2507.19202. https://arxiv.org/abs/2507.19202

[^6^] Tokui, N., & Baker, T. (2025). Latent Granular Resynthesis (PDF). arXiv:2507.19202. https://arxiv.org/pdf/2507.19202

[^7^] Tralie, C. J., & Cantil, B. (2024). The Concatenator: A Bayesian Approach To Real Time Concatenative Musaicing. arXiv:2411.04366. https://arxiv.org/abs/2411.04366

[^8^] Capes, T., et al. (2017). Siri On-Device Deep Learning-Guided Unit Selection Text-to-Speech System. Interspeech 2017. https://www.isca-archive.org/interspeech_2017/capes17_interspeech.pdf

[^9^] Merritt, T., et al. (2016). Deep Neural Network-guided unit selection synthesis. ICASSP 2016. https://www.cstr.ed.ac.uk/downloads/publications/2016/Merritt_ICASSP2016.pdf

[^10^] Ulgen, I. R., Chandra, S. S., Lu, J., & Sisman, B. (2024). Synthesizing Anyone's Voice via Discrete Unit-Based Frame Selection. arXiv:2408.17432. https://arxiv.org/abs/2408.17432

[^11^] Caillon, A., & Esling, P. (2021). RAVE: A variational autoencoder for fast and high-quality neural audio synthesis. arXiv:2111.05011. https://arxiv.org/abs/2111.05011

[^12^] Emergent Mind. (2025). RAVE: Real-Time Audio Variational Autoencoder. https://www.emergentmind.com/topics/real-time-audio-variational-autoencoder-rave

[^13^] Demerlé, N., Esling, P., Doras, G., & Genova, D. (2024). AFTER: Audio Features Transfer and Exploration in Real-time. GitHub: https://github.com/acids-ircam/AFTER

[^14^] Neural Analog. (2025). DDSP (Differentiable Digital Signal Processing), finally explained. https://neuralanalog.com/docs/ddsp-model-magenta

[^15^] Hayes, B., Shier, J., Fazekas, G., McPherson, A., & Saitis, C. (2023). A Review of Differentiable Digital Signal Processing for Music & Speech Synthesis. arXiv:2308.15422. https://arxiv.org/abs/2308.15422

[^16^] Hunt, A. J., & Black, A. W. (1996). Unit Selection in a Concatenative Speech Synthesis System Using a Large Speech Database. Eurospeech 1996. https://www.ee.columbia.edu/~dpwe/e6820/papers/HuntB96-speechsynth.pdf

[^17^] Schwarz, D. (2007). Corpus-based concatenative synthesis. IEEE Signal Processing Magazine, 24(2), 92-104. Referenced in Schwarz et al., ICMC 2007. http://articles.ircam.fr/textes/Schwarz07b/index.pdf

[^18^] Engel, J., Resnick, C., Roberts, A., Dieleman, S., Norouzi, M., Eck, D., & Simonyan, K. (2017). Neural Audio Synthesis of Musical Notes with WaveNet Autoencoders. arXiv:1704.01279. https://arxiv.org/pdf/1704.01279

[^19^] Zeghidour, N., et al. (2021). SoundStream: An End-to-End Neural Audio Codec. arXiv:2107.03312. https://arxiv.org/abs/2107.03312

[^20^] King, S. (2016). Hybrid Speech Synthesis. University of Edinburgh. https://speech.zone/media/images/Simon_King_Crete2016_4_hybrid_speech_synthesis_for_publication.pdf

[^21^] Capes et al. (2017). Siri On-Device TTS. Interspeech.

[^22^] Aalto University. Concatenative speech synthesis. Speech Processing Book. https://speechprocessingbook.aalto.fi/Synthesis/Concatenative_speech_synthesis.html

[^23^] Tokui & Baker (2025). Latent Granular Resynthesis. arXiv:2507.19202.

[^24^] Neural Analog. (2025). AFTER model documentation. https://neuralanalog.com/docs/after-model-ircam

[^25^] Neural Analog. (2025). DDSP model documentation. https://neuralanalog.com/docs/ddsp-model-magenta

### Additional Sources Consulted

- Baas, M., van Niekerk, B., & Kamper, H. (2023). Voice Conversion With Just Nearest Neighbors. Interspeech 2023. https://www.kamperh.com/papers/baas+vanniekerk+kamper_interspeech2023.pdf

- Südholt, D., & Erkut, C. (2023). Vocal Timbre Effects with Differentiable Digital Signal Processing. DAFX23. https://dafx.de/paper-archive/2023/DAFx23_paper_29.pdf

- Driedger, J., et al. (2015). Towards NMF-Inspired Audio Mosaicing. ISMIR 2015. https://www.audiolabs-erlangen.de/content/resources/MIR/00_2015-ISMIR-LetItBee/2015_DriedgerPM_AudioMosaicingNMF_ISMIR.pdf

- Esling, P., et al. (2018). Generative timbre spaces with variational audio synthesis. DAFx 2018. https://acids-ircam.github.io/variational-timbre/dafx18generative.pdf

- Qian, Y., Soong, F. K., & Yan, Z. J. (2013). A Unified Trajectory Tiling Approach to High Quality Speech Rendering. IEEE TASLP, 21(2), 280-290. Referenced in King (2016).

- Renault, L., Miguot, R., & Roebel, A. (2020). Differentiable Piano Model for Midi-to-Audio Performance Synthesis. DAFx 2020. https://dafx2020.mdw.ac.at/proceedings/papers/DAFx20in22_paper_48.pdf

- Babazadeh, D. (2025). Articulatory Voice-to-Instrument Timbre Transfer in Real-Time with Audio-Conditioned DDSP. UC Berkeley EECS MS thesis. https://www2.eecs.berkeley.edu/Pubs/TechRpts/2025/31739.html

- Ganem, R., & Bar Or, A. (2025). Reproducing kNN-VC: A Lightweight Approach to Voice Conversion. Medium. https://medium.com/@rachel.ganem/reproducing-knn-vc-a-lightweight-approach-to-voice-conversion-bbda0197512c

- Zheng, S., et al. (2024). A Mapping Strategy for Interacting with Latent Audio Synthesis Using Artistic Materials. arXiv:2407.04379. https://arxiv.org/html/2407.04379v1

- Hayes, B., et al. (2021). Neural Waveshaping Synthesis. ISMIR 2021.

- Vigliensoni, G. (2023). Latent Spaces as Platforms for Sonic Creativity. ICCC 2024. https://computationalcreativity.net/iccc24/papers/ICCC24_paper_154.pdf

- Wu, Y., et al. (2022). MIDI-DDSP: Detailed Control of Musical Performance via Hierarchical Modeling. ICLR 2022 (related work).

- Tatar, K., Bisig, D., & Pasquier, P. (2021). The Latent Timbre System. Referenced in Vigliensoni (2023).

- Guo, Y., et al. (2024). LVNS-RAVE: Latent Vector Novelty Search with RAVE. Referenced in Emergent Mind RAVE summary.

- Bargum, T., et al. (2024). Conditional RAVE for voice conversion. Referenced in Emergent Mind RAVE summary.

- Caspe, F., et al. (2025). BRAVE: Low-latency causal RAVE. Referenced in Emergent Mind RAVE summary.

- Tralie, C. J., et al. (2024). RAVE watermarking detection. Referenced in Emergent Mind RAVE summary.

- Nobukawa, S., et al. (2025). Drum-to-vocal percussion conversion with RAVE. Referenced in Emergent Mind RAVE summary.

- Imamura, T., et al. (2025). Music Similarity Representation Learning Focusing on Individual Instruments. arXiv:2503.18486. https://arxiv.org/abs/2503.18486

- Slaney, M. (2008). Learning a Metric for Music Similarity. ISMIR 2008. https://www.slaney.org/malcolm/yahoo/Slaney2008-MusicSimilarityMetricsISMIR.pdf

- Tokui, N. (2022). Data Mosaicing with Probabilistic Programming. arXiv:2210.14602. https://arxiv.org/pdf/2210.14602

---

*Document compiled April 2026. 25+ independent web searches conducted across arXiv, IEEE, ACM, ICMC, NIME, DAFX, ISMIR, Interspeech, IRCAM repositories, and official documentation.*
