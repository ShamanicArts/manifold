# Dimension 14: Future Directions & Emerging Paradigms in Concatenative Synthesis

## Research Report — Concatenative Synthesis Frontier (2024–2026)
**Compiled:** April 2026  
**Scope:** Speculative and early-stage developments at the frontier of concatenative synthesis, covering WebAssembly browser deployment, embedded neural hardware, real-time diffusion, multimodal corpora, AI-assisted curation, generative augmentation, voice cloning, spatial audio, neuromorphic/quantum computing, federated learning, blockchain attribution, and neural audio codecs.

---

## 1. WebAssembly for Browser-Based Concatenative Synthesis

### 1.1 The WASM + AudioWorklet Architecture

The convergence of WebAssembly (WASM) and the Web Audio API's AudioWorklet has created a viable path for professional-grade, real-time audio processing inside web browsers — a prerequisite for browser-based concatenative synthesis engines.

Claim: "WebAssembly is a low-level, binary instruction format serving as a portable compilation target for high-performance languages like C, C++, and Rust. Code compiled to WASM runs in the browser at near-native speed, vastly outperforming interpreted JavaScript for mathematical and processing-heavy tasks."[^1^]
Source: Jewel Music — Web Audio APIs and Browser DAWs  
URL: https://jewelmusic.art/blog/web-audio-apis-browser-daws/  
Date: 2025-01-27  
Excerpt: "WebAssembly is a low-level, binary instruction format serving as a portable compilation target for high-performance languages like C, C++, and Rust. Code compiled to WASM runs in the browser at near-native speed, vastly outperforming interpreted JavaScript for mathematical and processing-heavy tasks."  
Context: Overview of modern browser DAW architecture tiers  
Confidence: high

Claim: "For the most demanding, mission-critical audio tasks, WASM is often deployed inside an AudioWorklet. The AudioWorklet is a modern replacement for the deprecated ScriptProcessorNode, running audio processing code on a separate, high-priority thread."[^2^]
Source: Jewel Music — Web Audio APIs and Browser DAWs  
URL: https://jewelmusic.art/blog/web-audio-apis-browser-daws/  
Date: 2025-01-27  
Excerpt: "For the most demanding, mission-critical audio tasks, WASM is often deployed inside an AudioWorklet. The AudioWorklet is a modern replacement for the deprecated ScriptProcessorNode, running audio processing code on a separate, high-priority thread."  
Context: Three-tier browser audio architecture (Web Audio API → WASM → AudioWorklet)  
Confidence: high

Claim: "Developing AudioWorkletProcessors in WebAssembly provides the benefit of improved performance compared to JavaScript, and the Emscripten Wasm Audio Worklets system runtime has been carefully developed to guarantee that no temporary JavaScript level VM garbage will be generated, eliminating the possibility of GC pauses from impacting audio synthesis performance."[^3^]
Source: Emscripten Wasm Audio Worklets API Documentation  
URL: https://emscripten.org/docs/api_reference/wasm_audio_worklets.html  
Date: ongoing (current as of 2025)  
Excerpt: "Developing AudioWorkletProcessors in WebAssembly provides the benefit of improved performance compared to JavaScript, and the Emscripten Wasm Audio Worklets system runtime has been carefully developed to guarantee that no temporary JavaScript level VM garbage will be generated, eliminating the possibility of GC pauses from impacting audio synthesis performance."  
Context: Official Emscripten documentation for C/C++ audio worklet compilation  
Confidence: high

### 1.2 SuperCollider in the Browser: A Harbinger for Browser Corpus Synthesis

The 2025 port of SuperCollider's scsynth engine to browser AudioWorklets via WebAssembly demonstrates that even legacy, complex C++ synthesis engines can run in browsers with sample-accurate timing — strongly suggesting that corpus-based concatenative systems like CataRT could follow a similar path.

Claim: "SuperCollider's powerful audio synthesis engine _scsynth_ running in the browser as an AudioWorklet. Zero installation. AudioWorklet runs in a dedicated high priority audio thread. WebAssembly _scsynth_'s original C++ code compiled for the web. OSC API trigger synths with sample-accurate timing."[^4^]
Source: SuperSonic — SuperCollider's Synthesis Engine in the Browser  
URL: https://sonic-pi.net/supersonic/demo.html  
Date: 2025 (released late 2025)  
Excerpt: "SuperCollider's powerful audio synthesis engine _scsynth_ running in the browser as an AudioWorklet. Zero installation. AudioWorklet runs in a dedicated high priority audio thread. WebAssembly _scsynth_'s original C++ code compiled for the web. OSC API trigger synths with sample-accurate timing."  
Context: Sam Aaron's (Sonic Pi) project to bring SuperCollider to the web  
Confidence: high

Claim: "Getting samples working in SuperSonic turned out to be far harder than I thought... The work involved carefully coordinating shared memory between JS and the WASM AudioWorklet — such that the JS reads the .flac/.wav audio files, converts it to the right format, allocates memory to store it, writes it into memory with the correct padding, returns a pointer to that memory then tells scsynth about the pointer without scynth realising that it's not actually managing the memory itself."[^5^]
Source: Sam Aaron Patreon — SuperSonic is Ready for Tau5  
URL: https://www.patreon.com/posts/supersonic-is-143646114  
Date: 2025-11-15  
Excerpt: "Getting samples working in SuperSonic turned out to be far harder than I thought... The work involved carefully coordinating shared memory between JS and the WASM AudioWorklet"  
Context: Technical challenges of sample playback in WASM AudioWorklets  
Confidence: high

Claim: "This is more than just another synth demo in your browser. This is like suddenly your bicycle is also a 747 jumbo jet."[^6^]
Source: CDM (Create Digital Music) — SuperSonic article  
URL: https://cdm.link/supersonic-supercollider-for-web/  
Date: 2025-11-15  
Excerpt: "This is more than just another synth demo in your browser. This is like suddenly your bicycle is also a 747 jumbo jet."  
Context: Commentary on significance of browser-based SuperCollider  
Confidence: medium

### 1.3 Implications for Concatenative Synthesis

While no dedicated browser-based concatenative synthesis system exists yet, the infrastructure is now mature. A browser-based CataRT-like system would need: (1) WASM-compiled unit selection algorithms (k-d trees, FAISS-style approximate nearest neighbor), (2) AudioWorklet-based grain playback with crossfade scheduling, (3) SharedArrayBuffer or Web Audio buffer management for corpus audio data, and (4) Descriptor computation (MPEG-7, CLAP embeddings) either in WASM or via WebAssembly SIMD. The SuperSonic project proves all four are technically feasible.

---

## 2. Hardware Embedding: NeuroRave, NeuroRack, and Embedded RAVE

### 2.1 NeuroRave: F-RAVE in Eurorack Hardware

The NeuroRave prototype, developed by the ACIDS team at IRCAM, represents a landmark achievement in embedding deep generative audio models into performance hardware.

Claim: "The NeuroRave, a prototype hardware synthesizer that generates music using our F-RAVE model. The interface is a module following the Eurorack specifications in order to allow for CV and gate interactions with other classical Eurorack modules... The software computation is handled by a Jetson Nano, a mini-computer connected to our front board, which provides a 128-core GPU alongside with a Quad-core CPU."[^7^]
Source: NeuroRave project page  
URL: https://neurorave.github.io/neurorave/  
Date: ~2022  
Excerpt: "The NeuroRave, a prototype hardware synthesizer that generates music using our F-RAVE model. The interface is a module following the Eurorack specifications... The software computation is handled by a Jetson Nano"  
Context: F-RAVE expressive control model embedded in Eurorack hardware  
Confidence: high

### 2.2 NeuroRack: Descriptor-Driven Impact Synthesis on Jetson Nano

The NeuroRack preceded NeuroRave as IRCAM's first embedded deep AI synthesizer in Eurorack format.

Claim: "The Neurorack is the first hardware deep AI-based synthesizer, which fits in a Eurorack format. It can embed any deep synthesis model on the Jetson Nano development kit with a homemade circuit in a EuroRack format... For this first version of the Neurorack, we implemented a descriptor-based impact sounds generator."[^8^]
Source: ACIDS-IRCAM Projects Overview  
URL: https://acids-ircam.github.io/projects/  
Date: ongoing (project active since 2021)  
Excerpt: "The Neurorack is the first hardware deep AI-based synthesizer, which fits in a Eurorack format. It can embed any deep synthesis model on the Jetson Nano development kit... we implemented a descriptor-based impact sounds generator."  
Context: IRCAM ACIDS team embedded neural synthesis projects  
Confidence: high

Claim: "The real-time capabilities of the Neurorack rely on Jetson Nano's processing power and Ninon Devis' research into crafting trained models that are lightweight in both computation and memory footprint. Our original dream was to find a way to miniaturize deep models and allow them inside embedded audio hardware and synthesizers."[^9^]
Source: NVIDIA Developer Blog — Jetson Project of the Month  
URL: https://developer.nvidia.com/blog/jetson-neurorack-deep-ai-synthesizer/  
Date: 2022-03-14  
Excerpt: "Our original dream was to find a way to miniaturize deep models and allow them inside embedded audio hardware and synthesizers."  
Context: NVIDIA feature on Neurorack embedded implementation  
Confidence: high

Claim: "The research explores the idea that deep models may be highly over-parameterized and the hypothesis that extremely efficient small sub-networks exist in deep models and would provide higher accuracy than larger models, if trained in isolation. The approach tested removes up to 95% of the model weights, without significant degradation in accuracy."[^10^]
Source: Synthtopia — New Neurorack Module  
URL: https://www.synthtopia.com/content/2022/01/08/new-neurorack-module-brings-artificial-intelligence-to-your-eurorack-system/  
Date: 2022-01-08  
Excerpt: "The approach tested removes up to 95% of the model weights, without significant degradation in accuracy. This makes it possible to implement deep generative audio models on embedded platforms."  
Context: Lottery ticket hypothesis applied to neural audio synthesis for embedded deployment  
Confidence: high

### 2.3 RAVE on Raspberry Pi and Jetson Nano

RAVE (Realtime Audio Variational autoEncoder) has been successfully embedded on both Raspberry Pi 4 and NVIDIA Jetson Nano, demonstrating that neural audio synthesis — including corpus-derived timbre spaces — can run on sub-$100 hardware.

Claim: "The real-time neural audio synthesis model RAVE, that has been embedded into a Raspberry Pi and an Nvidia Jetson Nano, and the Neurorack, a Eurorack module running a neural source-filter model, also embedded on the Nvidia Jetson Nano."[^11^]
Source: NIME 2023 — Pipeline for recording datasets and running neural models  
URL: https://nime.org/proceedings/2023/nime2023_22.pdf  
Date: 2023  
Excerpt: "The real-time neural audio synthesis model RAVE, that has been embedded into a Raspberry Pi and an Nvidia Jetson Nano"  
Context: NIME paper surveying embedded neural audio for music/gesture  
Confidence: high

Claim: "Running RAVE models in realtime can be achieved through the use of our nn~ external (plugin) for Max/MSP and PureData, built specifically to interface streaming deep learning models inside Max/MSP and PD (ports to super collider and Tydal Cycles are also maintained by the community)."[^12^]
Source: NVIDIA Developer Forums — Embedded Realtime Neural Audio Synthesis  
URL: https://forums.developer.nvidia.com/t/embedded-realtime-neural-audio-synthesis-using-a-jetson-nano/236044  
Date: 2022-12-02  
Excerpt: "Running RAVE models in realtime can be achieved through the use of our nn~ external (plugin) for Max/MSP and PureData, built specifically to interface streaming deep learning models inside Max/MSP and PD"  
Context: ACIDS team tutorial on embedding RAVE via nn_tilde  
Confidence: high

### 2.4 AFTER and BRAVE: Lightweight Latent Diffusion for Embedded Use

AFTER (Audio Features Transfer and Exploration in Real-time) introduces latent diffusion operating on RAVE's latent space, enabling real-time timbre transfer with MIDI/audio control. The 2025 BRAVE variant optimizes RAVE for lower computational requirements.

Claim: "AFTER is a neural audio synthesis model designed to give musicians precise, real-time and polyphonic command over neural synthesis using familiar tools like MIDI and audio descriptors... AFTER is the result of the PhD research of Nils Demerlé at IRCAM... presented in the paper 'Combining audio control and style transfer using latent diffusion' in August 2024."[^13^]
Source: Neural Analog — AFTER Model Guide  
URL: https://neuralanalog.com/docs/after-model-ircam  
Date: 2025-11-19  
Excerpt: "AFTER is a neural audio synthesis model designed to give musicians precise, real-time and polyphonic command over neural synthesis using familiar tools like MIDI and audio descriptors"  
Context: Commercial documentation of AFTER based on IRCAM research  
Confidence: high

Claim: "BRAVE can be run in real-time but only at a larger block size of 256, which increases buffering latency... This prompts us to evaluate an implementation using different tools to avoid that temporal cost."[^14^]
Source: arXiv — Designing Neural Synthesizers for Low-Latency Interaction  
URL: https://arxiv.org/html/2503.11562v2  
Date: 2025-04-11  
Excerpt: "BRAVE can be run in real-time but only at a larger block size of 256, which increases buffering latency. We suspect this is due to scaffolding operations within scripted models that require a fixed time, such as memory allocation."  
Context: IEEE research on lightweight RAVE variants for low-latency interaction  
Confidence: high

Claim: "AFTER functions differently from instantaneous feed-forward models like RAVE. Latency: Diffusion requires iterative steps (denoising) to generate sound. In the real-time implementation, this typically results in a latency between 200ms and 500ms."[^15^]
Source: Neural Analog — AFTER Model Guide  
URL: https://neuralanalog.com/docs/after-model-ircam  
Date: 2025-11-19  
Excerpt: "Latency: Diffusion requires iterative steps (denoising) to generate sound. In the real-time implementation, this typically results in a latency between 200ms and 500ms."  
Context: Performance characteristics of real-time latent diffusion audio  
Confidence: high

### 2.5 Embedded Feasibility Analysis for Trimmed Models

A 2026 doctoral thesis formally evaluates the embedded feasibility of trimmed neural audio models.

Claim: "For the Pi 3B+ model, both full-size networks exceed the available computational capacity of the platform. While a trimmed RAVE could theoretically fit for streaming applications, AFTER remains too demanding even after removing 50% of its parameters. On the Raspberry Pi 4, both models fall below the maximal computational capacity, with AFTER operating near the board's limit and RAVE consuming around half."[^16^]
Source: PhD Thesis — Extracting lightweight neural networks from large models (HAL)  
URL: https://theses.hal.science/tel-05483131v1/file/161300_GENOVA_2025_archivage.pdf  
Date: 2026-01-29  
Excerpt: "On the Raspberry Pi 4, both models fall below the maximal computational capacity, with AFTER operating near the board's limit and RAVE consuming around half"  
Context: David Genova's thesis on neural network trimming for embedded audio  
Confidence: high

---

## 3. Real-Time Diffusion for Concatenative Refinement

### 3.1 CoSaRef: Concatenative Sampler + Diffusion Refinement

CoSaRef (Concatenative Sampler and Refinement), published October 2024 by Sony CSL researchers, is the clearest existing realization of the diffusion+concatenative hybrid paradigm.

Claim: "We propose CoSaRef, a MIDI-to-audio synthesis method that does not require MIDI-audio paired datasets. CoSaRef first generates a synthetic audio track using concatenative synthesis based on MIDI input, then refines it with a diffusion-based deep generative model trained on datasets without MIDI annotations... CoSaRef outperformed the state-of-the-art timbre-controllable method based on MIDI supervision in both objective and subjective evaluation."[^17^]
Source: arXiv — Annotation-Free MIDI-to-Audio Synthesis via Concatenative Synthesis and Generative Refinement  
URL: https://arxiv.org/abs/2410.16785  
Date: 2024-10-22  
Excerpt: "CoSaRef first generates a synthetic audio track using concatenative synthesis based on MIDI input, then refines it with a diffusion-based deep generative model trained on datasets without MIDI annotations... CoSaRef outperformed the state-of-the-art timbre-controllable method based on MIDI supervision in both objective and subjective evaluation."  
Context: Sony Computer Science Laboratories; peer-reviewed paper  
Confidence: high

Claim: "Future work should investigate CoSaRef on generating polyphonic, multi-track audio. Furthermore, future research should pursue a lightweight, real-time implementation of CoSaRef to facilitate its practical use in music composition workflows."[^18^]
Source: arXiv v2 — CoSaRef (updated June 2025)  
URL: https://arxiv.org/html/2410.16785v2  
Date: 2025-06-11  
Excerpt: "future research should pursue a lightweight, real-time implementation of CoSaRef to facilitate its practical use in music composition workflows"  
Context: Authors explicitly acknowledge real-time implementation as future work  
Confidence: high

### 3.2 Audio Inpainting via Discrete Diffusion for Corpus Gap Filling

Discrete diffusion models operating on tokenized audio (via neural codecs like WavTokenizer) show promise for filling gaps in concatenated sequences — a task directly applicable to smoothing transitions between corpus units.

Claim: "We introduce a novel inpainting method based on discrete diffusion modeling, which operates over tokenized audio representations produced by a pre-trained audio tokenizer. Our approach models the generative process directly in the discrete latent space, enabling stable and semantically coherent reconstruction of missing audio... our model maintains strong performance even on 500 ms gaps."[^19^]
Source: arXiv — Audio Inpainting using Discrete Diffusion Model  
URL: https://arxiv.org/html/2507.08333v1  
Date: 2025-07-11  
Excerpt: "We introduce a novel inpainting method based on discrete diffusion modeling, which operates over tokenized audio representations produced by a pre-trained audio tokenizer... our model maintains strong performance even on 500 ms gaps"  
Context: First study of Discrete Diffusion Models for audio inpainting  
Confidence: high

Claim: "Prior approaches—including waveform and spectrogram-based diffusion models—have shown promising results for short gaps, they often degrade in quality when gaps exceed 100 milliseconds (ms)."[^20^]
Source: arXiv — Audio Inpainting using Discrete Diffusion Model  
URL: https://arxiv.org/html/2507.08333v1  
Date: 2025-07-11  
Excerpt: "prior approaches... often degrade in quality when gaps exceed 100 milliseconds (ms)"  
Context: Gap-filling capability directly relevant to concatenative transition smoothing  
Confidence: high

---

## 4. Multimodal Corpora: Audio + Video + Motion Descriptors

### 4.1 ViVo: Video Analysis for Corpus-Based Audio-Visual Synthesis

The ViVo project extends corpus-based concatenative synthesis into the audiovisual domain, using video-specific descriptors to drive audio synthesis in parallel.

Claim: "Audio-visual corpus-based synthesis extends the principle of concatenative sound synthesis to the visual domain, where, in addition to the sound corpus, the artist uses a corpus of images with visual perceptual description (colour, texture, detail, brightness, entropy, movement), in order to create an audio-visual musical performance by navigating in real-time through these descriptor spaces."[^21^]
Source: HAL — Video Analysis for Corpus-based Audio–Visual Synthesis (ViVo)  
URL: https://hal.science/hal-04576894v1/file/Vivo_Proceedings_JIM-3.pdf  
Date: ~2022  
Excerpt: "Audio-visual corpus-based synthesis extends the principle of concatenative sound synthesis to the visual domain... the artist uses a corpus of images with visual perceptual description (colour, texture, detail, brightness, entropy, movement)"  
Context: JIM (Journées d'Informatique Musicale) proceedings; IRCAM-related research  
Confidence: high

Claim: "if the ViVo image and video descriptors are paired with the audio descriptors of video segments, then either audio- or image-descriptor-driven lookup and collage out of a video corpus becomes possible, extending the idea of the video sampler to content-driven synthesis."[^22^]
Source: HAL — Video Analysis for Corpus-based Audio–Visual Synthesis  
URL: https://hal.science/hal-04576894v1/file/Vivo_Proceedings_JIM-3.pdf  
Date: ~2022  
Excerpt: "either audio- or image-descriptor-driven lookup and collage out of a video corpus becomes possible, extending the idea of the video sampler to content-driven synthesis"  
Context: Future work section discussing bidirectional audio-visual corpus navigation  
Confidence: high

---

## 5. AI-Assisted Corpus Curation and Cleaning

### 5.1 Audio Annotation and Curation Tools

Modern AI-assisted annotation platforms are transforming how audio corpora are prepared for concatenative synthesis.

Claim: "LabelBuddy: An Open Source Music and Audio Language Annotation Tagging Tool Using AI Assistance... The core labeling workflow utilizes wavesurfer.js for responsive waveform visualization. AI-Assisted Pre-Annotation: Annotators trigger 'On-Demand Prediction,' which serializes the audio to the active Docker container. The system renders the returned predictions as editable regions, shifting the human task from creation to verification."[^23^]
Source: arXiv — LabelBuddy  
URL: https://arxiv.org/html/2603.04293v1  
Date: 2026-03-04  
Excerpt: "LabelBuddy: An Open Source Music and Audio Language Annotation Tagging Tool Using AI Assistance... AI-Assisted Pre-Annotation: Annotators trigger 'On-Demand Prediction,' which serializes the audio to the active Docker container."  
Context: Peer-reviewed open-source tool for music/audio annotation with AI pre-labeling  
Confidence: high

Claim: "AudioSet-Tools, a modular Python framework designed for reproducible and task-oriented dataset construction from AudioSet... It addresses all previous technical and conceptual limitations by enabling structured label filtering, taxonomy configuration, class balancing, and robust automatic segments download and pre-processing."[^24^]
Source: Springer — AudioSet-tools  
URL: https://link.springer.com/article/10.1186/s13636-025-00436-z  
Date: 2025-12-02  
Excerpt: "AudioSet-Tools, a modular Python framework designed for reproducible and task-oriented dataset construction from AudioSet... enabling structured label filtering, taxonomy configuration, class balancing, and robust automatic segments download and pre-processing"  
Context: Peer-reviewed framework for large-scale audio dataset curation  
Confidence: high

### 5.2 Semantic Corpus Navigation via CLAP

CLAP (Contrastive Language-Audio Pretraining) embeddings enable semantic, language-driven navigation through audio corpora — a fundamental shift from acoustic-only descriptor spaces to multimodal semantic spaces.

Claim: "CLAP is trained using paired audio samples and their corresponding textual descriptions, learning to encode both modalities as 512-dimensional embedding vectors... This bi-directional capability enables flexible retrieval and comparison between audio and text, making CLAP a powerful tool for applications that span both modalities."[^25^]
Source: Medium — CLAP for Semantic Origin Detection  
URL: https://medium.com/@balubm_57188/contrastive-language-audio-pretraining-clap-for-semantic-origin-detection-8a2dd149e0c5  
Date: 2025-12-22  
Excerpt: "CLAP is trained using paired audio samples and their corresponding textual descriptions, learning to encode both modalities as 512-dimensional embedding vectors... This bi-directional capability enables flexible retrieval and comparison between audio and text"  
Context: CLAP architecture and cross-modal capabilities  
Confidence: high

Claim: "I currently work at Splice, leading search and personalization engineering, where we're taking on the difficult problem of increasing relevance for text queries on audio sources."[^26^]
Source: HaystackConf 2024 — CLAP With Me talk  
URL: https://haystackconf.com/us2024/talk-11/  
Date: 2024-04-23  
Excerpt: "I currently work at Splice, leading search and personalization engineering, where we're taking on the difficult problem of increasing relevance for text queries on audio sources"  
Context: Splice (major sample library platform) adopting CLAP for semantic audio search  
Confidence: high

Claim: "Producers and Sound Designers: Reference tracking becomes systematic and objective. Vectorise your reference track, query your local sample library as a vector database, and retrieve sounds that are measurably similar rather than relying on subjective ear-matching."[^27^]
Source: TheMusicase — How CLAP Embeddings Are Changing Music Intelligence  
URL: https://www.themusicase.com/blog/ai-music-analysis-audio-vectoring-how-clap-embeddings-are-changing-music-intelligence/  
Date: 2026-03-09  
Excerpt: "Vectorise your reference track, query your local sample library as a vector database, and retrieve sounds that are measurably similar rather than relying on subjective ear-matching"  
Context: Commercial application of CLAP vectors for sample library semantic search  
Confidence: high

---

## 6. Generative Corpus Expansion

### 6.1 Synthio: Synthetic Data Augmentation for Audio Classification

Synthio demonstrates how text-to-audio models, aligned via preference optimization, can expand small-scale audio datasets with acoustically consistent synthetic samples.

Claim: "We propose Synthio, a novel, controllable and scalable approach for augmenting small-scale audio classification datasets with synthetic data... aligning the generations of the T2A model with the target characteristics of the small-scale dataset using preference optimization... Synthio outperforms all baselines by 0.1%-39%."[^28^]
Source: arXiv — Synthio: Augmenting Small-Scale Audio Classification Datasets with Synthetic Data  
URL: https://arxiv.org/html/2410.02056v2  
Date: 2024  
Excerpt: "Synthio, a novel, controllable and scalable approach for augmenting small-scale audio classification datasets with synthetic data... Synthio outperforms all baselines by 0.1%-39%"  
Context: Text-to-audio generation for dataset expansion  
Confidence: high

### 6.2 GAN-Based Audio Augmentation

GANs have been explored for augmenting speech datasets, with mixed but promising results.

Claim: "EMDGAN-4 potentially boasts greater diversity than WaveGAN, rendering it potentially more suitable for applications involving data augmentation... when applied to FSDD and AudioMNIST, EMDGAN-4's adoption reduced the WER by 0.63% and 0.43%, respectively."[^29^]
Source: Springer — Audio generation model based on EMD and GANs  
URL: https://link.springer.com/article/10.1186/s13636-025-00427-0  
Date: 2025-11-28  
Excerpt: "EMDGAN-4 potentially boasts greater diversity than WaveGAN, rendering it potentially more suitable for applications involving data augmentation"  
Context: EMDGAN for speech data augmentation  
Confidence: medium

Claim: "The experimental results show that the designed GANs structures have the ability to learn the distribution of the real acoustic data. However, some strange variations are also created in generated samples, which may not exist in real speech features. Thus, the data synthesised by GANs fail to reduce the phone error rate of the acoustic model in ASR task."[^30^]
Source: Cambridge MPhil Thesis — GANs for Speech Recognition Data Augmentation  
URL: https://www.mlmi.eng.cam.ac.uk/files/tianyu_wu_mphil-thesis.pdf  
Date: ~2019  
Excerpt: "some strange variations are also created in generated samples, which may not exist in real speech features. Thus, the data synthesised by GANs fail to reduce the phone error rate"  
Context: Cautionary finding on GAN-based augmentation quality for speech  
Confidence: high

---

## 7. Personal Voice Cloning + Concatenative Playback

### 7.1 The Hybrid Paradigm

Voice cloning and concatenative synthesis are converging in commercial TTS systems, where neural models handle general speech and concatenative components preserve signature phrases or unique vocal characteristics.

Claim: "For voice agent developers, concatenative synthesis typically serves as a specialized component rather than a complete replacement for neural TTS. Use it for signature phrases, brand-specific pronunciations, or unique character voices while relying on neural methods for general conversation."[^31^]
Source: Vapi — How to Create Natural Audio Using Concatenative Synthesis  
URL: https://vapi.ai/blog/concatenative-synthesis  
Date: 2025-05-30  
Excerpt: "concatenative synthesis typically serves as a specialized component rather than a complete replacement for neural TTS. Use it for signature phrases, brand-specific pronunciations, or unique character voices while relying on neural methods for general conversation"  
Context: Commercial voice AI platform recommending hybrid architecture  
Confidence: high

Claim: "A well-optimized system can select and concatenate segments in under 100ms, suitable for interactive voice applications... hybrid approaches (combining with neural smoothing for artifact reduction)."[^32^]
Source: Vapi — Concatenative Synthesis FAQ  
URL: https://vapi.ai/blog/concatenative-synthesis  
Date: 2025-05-30  
Excerpt: "A well-optimized system can select and concatenate segments in under 100ms, suitable for interactive voice applications... hybrid approaches (combining with neural smoothing for artifact reduction)"  
Context: Performance benchmarks for real-time concatenative voice systems  
Confidence: medium

### 7.2 VALL-E and Neural Codec Language Models

Microsoft's VALL-E family represents a neural approach that implicitly uses codec-based "unit selection" — conceptually adjacent to concatenative synthesis but operating on discrete learned tokens rather than raw audio segments.

Claim: "VALL-E is a Neural Codec Language Model that regards TTS as a conditional language modeling task... it uses discrete units based on phoneme and acoustic prompts. This model is capable of zero-shot TTS using an acoustic prompt input to generate a waveform maintaining the speaker's emotion and voice characteristics."[^33^]
Source: arXiv — Voice Cloning: Comprehensive Survey  
URL: https://arxiv.org/html/2505.00579v1  
Date: 2025-05-01  
Excerpt: "VALL-E is a Neural Codec Language Model that regards TTS as a conditional language modeling task... capable of zero-shot TTS using an acoustic prompt input to generate a waveform maintaining the speaker's emotion and voice characteristics"  
Context: Comprehensive survey of voice cloning including VALL-E family  
Confidence: high

Claim: "VALL-E 2 achieves a groundbreaking milestone: human parity in zero-shot TTS performance on LibriSpeech and VCTK datasets. This marks the first instance of such an achievement."[^34^]
Source: Microsoft Research — VALL-E project page  
URL: https://www.microsoft.com/en-us/research/project/vall-e-x/  
Date: 2025-05-09  
Excerpt: "VALL-E 2 achieves a groundbreaking milestone: human parity in zero-shot TTS performance on LibriSpeech and VCTK datasets. This marks the first instance of such an achievement"  
Context: Official Microsoft Research project page  
Confidence: high

---

## 8. Spatial Audio and Ambisonics with Corpus Methods

### 8.1 Spatial Modulation Synthesis

Spatial Modulation Synthesis (SMS) uses high-speed spatialization trajectories to create synthesis effects — unifying space and timbre control in a way that extends naturally to corpus-based spatial granulation.

Claim: "Spatial modulation synthesis is a paradigm through which modulation synthesis and granulation effects can be produced via high-speed sound spatialization within periodic trajectory orbits... Spatialization algorithms include a means for disturbing the output to each loudspeaker, such as VBAP or Ambisonics."[^35^]
Source: ICMC 2015 — Spatial Modulation Synthesis  
URL: https://lifeorange.com/writing/SpatialModulationSynthesis_ICMC2015.pdf  
Date: 2015  
Excerpt: "Spatial modulation synthesis is a paradigm through which modulation synthesis and granulation effects can be produced via high-speed sound spatialization within periodic trajectory orbits... Spatialization algorithms include VBAP or Ambisonics"  
Context: Peer-reviewed ICMC paper; foundational spatial corpus/granular work  
Confidence: high

### 8.2 Ambisonics Granular Synthesis

Csound implementations demonstrate practical Ambisonics granular synthesis for 3D spatialized corpus playback.

Claim: "The spatialisation of the grains is achieved mainly using the Ambisonics technique through the spat3di and the bformenc1 opcodes... The spat3di opcode provides 3D sound spatialisation computing both the direct signal and the early echoes... the output of this opcode was set to B-Format First Order Ambisonics."[^36^]
Source: ICSC 2017 — Spectral and 3D spatial granular synthesis in Csound  
URL: https://csound.com/icsc2017/proceedings/ICSC2017_paper_Di.Liscia.pdf  
Date: 2017  
Excerpt: "The spatialisation of the grains is achieved mainly using the Ambisonics technique through the spat3di and the bformenc1 opcodes... output of this opcode was set to B-Format First Order Ambisonics"  
Context: International Csound Conference paper on 3D spatial granular synthesis  
Confidence: high

### 8.3 HRTF-Based Corpus Spatialization

HRTF database matching approaches can be adapted for corpus-based spatial audio, where each grain is convolved with an HRTF selected from a corpus of spatial filters.

Claim: "This study investigates HRTF database matching as a means for creating an individualized spatial user experience... Navigation through the repository is achieved by gradually focusing on the region of the collection around which one's best match is located... Upon selection, the winning cluster is re-clustered into smaller zones and the procedure is repeated iteratively."[^37^]
Source: EAA/DAGA 2025 — HRTF Database Matching for Localization Accuracy  
URL: https://dael.euracoustics.org/confs/fa2025/data/articles/000434.pdf  
Date: 2025  
Excerpt: "Navigation through the repository is achieved by gradually focusing on the region of the collection around which one's best match is located... the winning cluster is re-clustered into smaller zones and the procedure is repeated iteratively"  
Context: European Acoustics Association conference paper on HRTF corpus matching  
Confidence: high

Claim: "An individual's head-related transfer function describes the idiosyncratic filtering of incident sound waves by the individual's body... HRTFs can be combined with Room Impulse Responses to create Binaural Room Impulse Responses."[^38^]
Source: Brandenburg Labs — Introduction to HRTF  
URL: https://brandenburg-labs.com/introduction-to-head-related-transfer-function-hrtf/  
Date: 2025-10-23  
Excerpt: "HRTFs can be combined with Room Impulse Responses to create Binaural Room Impulse Responses. BRIRs incorporate both the filtering effects of the listener's head and ears and the reflections and reverberation of the environment"  
Context: Technical introduction to HRTF fundamentals  
Confidence: high

---

## 9. Vector Databases for Million-Scale Corpus Search

### 9.1 FAISS, ANNOY, and Modern Vector Search

The maturation of vector database libraries enables million-scale audio corpus similarity search in real time — a critical enabler for large-scale concatenative synthesis.

Claim: "FAISS, developed by Facebook's AI team, is an open-source library specialized in efficient similarity search and clustering of dense vectors. It's particularly well-suited for large-scale vector search tasks... GPU support enhances performance in AI-driven applications."[^39^]
Source: SingleStore — Ultimate Guide to Vector Database Landscape 2024  
URL: https://www.singlestore.com/blog/-ultimate-guide-vector-database-landscape-2024/  
Date: 2025-01-15  
Excerpt: "FAISS... is an open-source library specialized in efficient similarity search and clustering of dense vectors. It's particularly well-suited for large-scale vector search tasks"  
Context: Comprehensive survey of vector search infrastructure  
Confidence: high

Claim: "ANNOY, another open-source project, is designed for memory-efficient and fast approximate nearest neighbor searches in high-dimensional spaces. Developed by Spotify, it's commonly used in scenarios where quick, approximate results are sufficient."[^40^]
Source: SingleStore — Ultimate Guide to Vector Database Landscape 2024  
URL: https://www.singlestore.com/blog/-ultimate-guide-vector-database-landscape-2024/  
Date: 2025-01-15  
Excerpt: "ANNOY... is designed for memory-efficient and fast approximate nearest neighbor searches in high-dimensional spaces. Developed by Spotify"  
Context: Spotify's ANNOY library widely used in audio/music recommendation  
Confidence: high

---

## 10. Neuromorphic and Quantum Computing for Audio

### 10.1 Neuromorphic Audio Processing

Neuromorphic computing — using spiking neural networks (SNNs) on brain-inspired hardware — offers radical energy efficiency advantages that could transform embedded corpus search and audio processing.

Claim: "Neuromorphic audio systems are computational frameworks designed to process audio signals by mimicking the neural structures and functions of the human brain... leveraging spiking neural networks (SNNs) to process data in a parallel and event-driven manner."[^41^]
Source: Meegle — Neuromorphic Audio Systems  
URL: https://www.meegle.com/en_us/topics/neuromorphic-engineering/neuromorphic-audio-systems  
Date: 2026-02-07  
Excerpt: "Neuromorphic audio systems are computational frameworks designed to process audio signals by mimicking the neural structures and functions of the human brain... leveraging spiking neural networks (SNNs)"  
Context: Technical overview of neuromorphic audio systems  
Confidence: high

Claim: "Intel's Loihi chip has demonstrated energy savings of up to 1000x compared to traditional processors in specific tasks."[^42^]
Source: Meegle — Neuromorphic Audio Systems  
URL: https://www.meegle.com/en_us/topics/neuromorphic-engineering/neuromorphic-audio-systems  
Date: 2026-02-07  
Excerpt: "Intel's Loihi chip has demonstrated energy savings of up to 1000x compared to traditional processors in specific tasks"  
Context: Energy efficiency claims for neuromorphic audio processing  
Confidence: medium (specific task-dependent claim)

Claim: "The HPCNeuroNet architecture employs the Short-Time Fourier Transform for time-frequency representation, Transformer embeddings for dense vector generation, and SNN encoding/decoding mechanisms for spike train conversions... The proposed accelerator achieves a throughput of 71.11 Giga-Operations Per Second with a 3.55 W on-chip power consumption at 100 MHz."[^43^]
Source: arXiv — HPCNeuroNet: Advancing Neuromorphic Audio Signal Processing  
URL: https://arxiv.org/abs/2311.12449  
Date: 2023-11-21  
Excerpt: "The proposed accelerator achieves a throughput of 71.11 Giga-Operations Per Second with a 3.55 W on-chip power consumption at 100 MHz"  
Context: Transformer+SNN hybrid on FPGA for neuromorphic audio  
Confidence: high

### 10.2 Top Neuromorphic Chips in 2025

Claim: "Top Neuromorphic Chips in 2025: BrainChip Akida, Intel Loihi, and IBM TrueNorth. IBM's TrueNorth: 1 Million Neurons and 256 Million Synapses, 5.4 Billion Transistors, ~70mW power consumption. Intel Loihi: 128k neurons, 128 million synapses, <1.5W, on-chip learning enabled."[^44^]
Source: Elprocus — Top Neuromorphic Chips in 2025  
URL: https://www.elprocus.com/top-neuromorphic-chips-in-2025/  
Date: 2025-08-02  
Excerpt: "IBM's TrueNorth: 1 Million Neurons and 256 Million Synapses... ~70mW power consumption. Intel Loihi: 128k neurons, 128 million synapses, <1.5W"  
Context: Commercial overview of neuromorphic chip landscape  
Confidence: high

### 10.3 Quantum Computing for Audio Search

Quantum algorithms, particularly Grover's algorithm, offer theoretical quadratic speedups for unstructured search — relevant to corpus unit selection in very large databases.

Claim: "Grover's algorithm reduces [unstructured search] to O(sqrt(N)), offering a substantial speed boost... It operates in three main steps: 1. Superposition: The quantum system initializes all possible states simultaneously. 2. Grover Operator (Amplitude Amplification): The algorithm amplifies the probability of the correct solution while reducing others using quantum interference. 3. Measurement."[^45^]
Source: SpinQuanta — Grover's Algorithm  
URL: https://www.spinquanta.com/news-detail/grovers-algorithm-how-it-speeds-up-quantum-search20250123082524  
Date: 2025-01-28  
Excerpt: "Grover's algorithm reduces [unstructured search] to O(sqrt(N)), offering a substantial speed boost"  
Context: Overview of quantum search algorithm applicability  
Confidence: high

Claim: "Grover's Algorithm Offers No Quantum Advantage... we construct a quantum inspired algorithm, executable on a classical computer, that performs Grover's task in a linear number of call to the oracle – an exponentially smaller number than Grover's algorithm."[^46^]
Source: Scott Aaronson blog — rebuttal to "Grover's Algorithm Offers No Quantum Advantage"  
URL: https://scottaaronson.blog/?p=7143  
Date: 2023-03-22  
Excerpt: "we construct a quantum inspired algorithm, executable on a classical computer, that performs Grover's task in a linear number of call to the oracle"  
Context: Controversial claim that quantum advantage for search may be limited; strongly contested  
Confidence: medium (debated in field)

Claim: "Quantum algorithms could revolutionize how we analyze audio: Spectral analysis: Quantum Fourier Transforms may provide exponential speedups for frequency analysis. Pattern recognition: Quantum search algorithms could identify patterns in audio data more efficiently."[^47^]
Source: Departure Music — Quantum Computing for Audio Processing  
URL: https://www.departuremusic.com/quantum-computing-for-audio-processing/  
Date: 2025-08-22  
Excerpt: "Quantum Fourier Transforms may provide exponential speedups for frequency analysis. Pattern recognition: Quantum search algorithms could identify patterns in audio data more efficiently"  
Context: Speculative but informed survey of quantum audio applications  
Confidence: low (speculative, no working implementations demonstrated)

---

## 11. Federated Learning for Distributed Corpus Building

Federated learning enables distributed training on private audio collections without centralizing raw data — a model for collaborative corpus construction while preserving privacy.

Claim: "Federated learning (FL) is a distributed machine learning pattern where many clients train models on local data locally. Raw data are not uploaded to some middleman server; model updates are uploaded instead."[^48^]
Source: DZone — Federated Learning  
URL: https://dzone.com/articles/federated-learning-training-models-without-sharing  
Date: 2025-09-26  
Excerpt: "Federated learning (FL) is a distributed machine learning pattern where many clients train models on local data locally. Raw data are not uploaded to some middleman server; model updates are uploaded instead"  
Context: General federated learning overview  
Confidence: high

Claim: "We present a new Federated Learning algorithm to train a machine learning model when data modalities are split among different devices... We evaluate our algorithm on two different data sets present key results showing improvements in model performance."[^49^]
Source: arXiv — Partial Federated Learning  
URL: https://arxiv.org/html/2403.01615v1  
Date: 2024-03-03  
Excerpt: "We present a new Federated Learning algorithm to train a machine learning model when data modalities are split among different devices"  
Context: Novel partial FL approach for multimodal distributed data  
Confidence: high

---

## 12. Blockchain for Audio Attribution

Blockchain-based systems are emerging to solve attribution and royalty distribution for audio samples — directly relevant to concatenative synthesis where corpus provenance must be tracked.

Claim: "BRX Provenance does not merely ride the trend of NFTs or digital collectables: its focus is forensic notarization, which involves the temporal and mathematical anchoring of the genesis of a work, certified through the blockchain as an immutable digital ledger."[^50^]
Source: MEXC — Music Certification on Blockchain with AI  
URL: https://www.mexc.com/news/874666  
Date: 2026-03-07  
Excerpt: "BRX Provenance... its focus is forensic notarization, which involves the temporal and mathematical anchoring of the genesis of a work, certified through the blockchain as an immutable digital ledger"  
Context: BRX Provenance music authentication system  
Confidence: medium (commercial initiative)

Claim: "The BRX Code: A New Classification for Digital Music... For each of these phases, the protocol assigns a level of transparency: 1. Human Origin (H) 2. Algorithmic Assistance (A) 3. Synthetic Generation (G)."[^51^]
Source: MEXC — Music Certification on Blockchain with AI  
URL: https://www.mexc.com/news/874666  
Date: 2026-03-07  
Excerpt: "For each of these phases, the protocol assigns a level of transparency: 1. Human Origin (H) 2. Algorithmic Assistance (A) 3. Synthetic Generation (G)"  
Context: Three-letter classification system for AI/human music provenance  
Confidence: medium

Claim: "In 2026, blockchain royalties have emerged as the solution. Blockchain ensures an immutable record of music usage and ownership. This transparency makes it easier for all participants to see exactly how revenue is calculated."[^52^]
Source: Soundverse — Smart Contracts for Music Royalties  
URL: https://www.soundverse.ai/blog/article/smart-contracts-for-music-royalties-explained-0059  
Date: 2026-02-10  
Excerpt: "In 2026, blockchain royalties have emerged as the solution. Blockchain ensures an immutable record of music usage and ownership"  
Context: Industry perspective on blockchain music royalties in 2026  
Confidence: medium (industry promotional content)

---

## 13. Real-Time Neural Audio Codecs for Corpus Streaming

Neural audio codecs (SoundStream, EnCodec, AudioDec) enable extreme compression of audio corpora with perceptually transparent quality, making large corpus streaming feasible over bandwidth-constrained channels.

Claim: "We present SoundStream, a novel neural audio codec that can efficiently compress speech, music and general audio at bitrates normally targeted by speech-tailored codecs... In subjective evaluations using audio at 24kHz sampling rate, SoundStream at 3kbps outperforms Opus at 12kbps and approaches EVS at 9.6kbps."[^53^]
Source: arXiv — SoundStream: An End-to-End Neural Audio Codec  
URL: https://arxiv.org/abs/2107.03312  
Date: 2021-07-07  
Excerpt: "SoundStream at 3kbps outperforms Opus at 12kbps and approaches EVS at 9.6kbps"  
Context: Google's foundational neural audio codec paper  
Confidence: high

Claim: "SoundStream is the first neural network codec to work on speech and music, while being able to run in real-time on a smartphone CPU."[^54^]
Source: Google Research Blog — SoundStream  
URL: https://research.google/blog/soundstream-an-end-to-end-neural-audio-codec/  
Date: 2021-08-12  
Excerpt: "SoundStream is the first neural network codec to work on speech and music, while being able to run in real-time on a smartphone CPU"  
Context: Official Google Research blog post  
Confidence: high

Claim: "We introduce a state-of-the-art real-time, high-fidelity, audio codec leveraging neural networks... Our approach is superior to the baselines methods across all evaluated settings, considering both 24 kHz monophonic and 48 kHz stereophonic audio."[^55^]
Source: arXiv — High Fidelity Neural Audio Compression (EnCodec)  
URL: https://arxiv.org/abs/2210.13438  
Date: 2022-10-24  
Excerpt: "Our approach is superior to the baselines methods across all evaluated settings, considering both 24 kHz monophonic and 48 kHz stereophonic audio"  
Context: Meta AI's EnCodec paper  
Confidence: high

Claim: "An open-source, streamable, and real-time neural audio codec that achieves strong performance along all three axes: it can reconstruct highly natural sounding 48 kHz speech signals while operating at only 12 kbps and running with less than 6 ms (GPU)/10 ms (CPU) latency."[^56^]
Source: AudioDec Demo (Meta Reality Labs)  
URL: https://bigpon.github.io/AudioDec_demo/  
Date: ongoing (2023+)  
Excerpt: "reconstruct highly natural sounding 48 kHz speech signals while operating at only 12 kbps and running with less than 6 ms (GPU)/10 ms (CPU) latency"  
Context: Meta Reality Labs open-source neural codec  
Confidence: high

---

## 14. Tensions, Trade-offs, and Counter-Narratives

### 14.1 Real-Time Diffusion Latency vs. Quality

The central tension in diffusion-based concatenative refinement is latency. AFTER achieves real-time operation but with 200–500ms latency, making it unsuitable for immediate instrumental response. CoSaRef explicitly identifies "lightweight, real-time implementation" as future work.

### 14.2 GAN Augmentation: Quality vs. Quantity

GAN-based corpus augmentation struggles with distribution alignment. The Cambridge MPhil thesis found that GAN-generated speech features contained "strange variations" not present in real data, failing to improve ASR performance. Synthio's preference-optimization approach may address this, but quality control remains critical.

### 14.3 Quantum Audio: Promise vs. Practicality

Quantum computing for audio search remains almost entirely theoretical. Scott Aaronson's rebuttal of claims that Grover's algorithm offers no advantage highlights the contested nature of even basic quantum speedup claims. No practical quantum audio search system exists.

### 14.4 Blockchain Attribution: Hype vs. Adoption

Blockchain music attribution systems like BRX Provenance and Soundverse are emerging but face adoption barriers. The 2026 claims about "blockchain royalties have emerged as the solution" should be read as industry aspiration rather than accomplished fact.

### 14.5 Neuromorphic Audio: Efficiency vs. Capability

Neuromorphic chips achieve dramatic energy efficiency (1000x in specific tasks) but lack the maturity and software ecosystem of conventional DSP. The gap between neuromorphic hardware capabilities and real-world audio application requirements remains significant.

---

## 15. Key Actors and Stakeholders

| Actor | Role | Notable Contributions |
|-------|------|----------------------|
| **IRCAM / ACIDS** (Paris) | Leading research institution | RAVE, AFTER, NeuroRack, NeuroRave, nn_tilde, CataRT |
| **Sony Computer Science Laboratories** (Tokyo) | Corporate research | CoSaRef (concatenative + diffusion) |
| **Meta AI** | Neural codec research | EnCodec, AudioDec open-source codecs |
| **Google Research** | Neural codec research | SoundStream, Lyra |
| **Microsoft Research** | Voice synthesis | VALL-E family of neural codec language models |
| **Splice** | Commercial sample platform | CLAP-based semantic audio search |
| **Sam Aaron / Sonic Pi** | Creative coding | SuperSonic (SuperCollider in browser) |
| **Ninon Devis / Nils Demerlé** (IRCAM PhDs) | Embedded neural audio | NeuroRack, AFTER architectures |
| **Diemo Schwarz** (IRCAM) | Concatenative synthesis pioneer | CataRT, foundational corpus synthesis |
| **BrainChip, Intel, IBM** | Neuromorphic hardware | Akida, Loihi, TrueNorth chips |
| **BRX Provenance / Soundverse** | Blockchain attribution | Smart contract royalty systems |

---

## 16. Historical Evolution and Milestones

| Year | Milestone | Significance |
|------|-----------|------------|
| 2006 | CataRT real-time corpus synthesis (DAFx) | First real-time concatenative system with descriptor navigation[^1^] |
| 2015 | Spatial Modulation Synthesis (ICMC) | Unified spatialization and synthesis for granular/corpus methods[^35^] |
| 2017 | Csound Ambisonics granular synthesis (ICSC) | Practical 3D spatialized grain playback[^36^] |
| 2021 | SoundStream (Google) | First real-time neural audio codec for speech and music[^53^] |
| 2022 | EnCodec (Meta AI) | High-fidelity neural compression for 48kHz stereo[^55^] |
| 2022 | NeuroRack (IRCAM ACIDS) | First embedded deep AI Eurorack synthesizer[^8^] |
| 2022 | RAVE embedded on Raspberry Pi/Jetson | Neural audio synthesis on sub-$100 hardware[^11^] |
| 2023 | AudioDec (Meta) | Open-source streaming neural codec <10ms latency[^56^] |
| 2023 | HPCNeuroNet (FPGA neuromorphic audio) | Transformer+SNN hybrid for audio processing[^43^] |
| 2024 | CoSaRef (Sony CSL) | First published concatenative + diffusion hybrid[^17^] |
| 2024 | AFTER paper (IRCAM) | Real-time latent diffusion audio with MIDI control[^13^] |
| 2025 | SuperSonic release | SuperCollider synthesis engine running in browser[^4^] |
| 2025 | BRAVE lightweight RAVE | Low-latency neural synthesis optimization[^14^] |
| 2025 | Discrete Diffusion Audio Inpainting | Token-space diffusion for gap filling up to 500ms[^19^] |
| 2025 | Synthio synthetic augmentation | Preference-aligned T2A for dataset expansion[^28^] |
| 2025 | AudioSet-tools framework | Taxonomy-aware audio dataset curation[^24^] |
| 2026 | LabelBuddy release | Open-source AI-assisted music/audio annotation[^23^] |

---

## 17. Concrete Examples and Implementations

### 17.1 Browser-Deployable Systems
- **SuperSonic** (https://sonic-pi.net/supersonic/demo.html): SuperCollider scsynth in browser via WASM AudioWorklet — proves complex C++ synthesis in browsers[^4^]
- **Emscripten Wasm Audio Worklets**: Official toolchain for C/C++ audio DSP in browser AudioWorklets[^3^]

### 17.2 Embedded Neural Synthesis Hardware
- **NeuroRave** (neurorave.github.io): F-RAVE in Eurorack with Jetson Nano[^7^]
- **NeuroRack** (github.com/acids-ircam/neurorack): Open-source DIY AI Eurorack module[^8^]
- **RAVE + nn_tilde** (github.com/acids-ircam/nn_tilde): Max/MSP/PureData external for real-time neural models[^12^]

### 17.3 Diffusion + Concatenative Hybrids
- **CoSaRef** (flymoons.github.io/midi-to-audio-demo/): Concatenative sampler + diffusion refinement for MIDI-to-audio[^17^]
- **AFTER** (github.com/acids-ircam/AFTER): Latent diffusion timbre transfer with MIDI/audio control[^13^]

### 17.4 Neural Audio Codecs
- **EnCodec** (github.com/facebookresearch/encodec): Meta's open-source high-fidelity neural codec[^55^]
- **AudioDec** (bigpon.github.io/AudioDec_demo/): Meta Reality Labs' streaming open-source codec[^56^]

### 17.5 Semantic Corpus Search
- **Audiobrain** (Mac app): CLAP-based local audio vectorization and semantic search[^27^]
- **Splice search**: CLAP-powered semantic search in production sample library[^26^]

---

## 18. Current State (2024–2026): What Is Happening Now

1. **Browser infrastructure is mature** but no dedicated browser concatenative synthesis system exists yet. SuperSonic proves the architecture works.

2. **Embedded neural audio is production-viable**: RAVE runs on Raspberry Pi 4; AFTER runs on Jetson Nano; NeuroRack/NeuroRave are performable instruments.

3. **Diffusion + concatenative hybrids are research-active**: CoSaRef (2024) and AFTER (2024) establish the paradigm; real-time lightweight implementations remain future work.

4. **CLAP semantic search is entering commercial platforms**: Splice, Audiobrain, and others are deploying text-to-audio retrieval in production.

5. **Neural codecs enable corpus streaming at extreme compression**: 3kbps SoundStream exceeds 12kbps Opus quality; AudioDec achieves <10ms latency.

6. **Blockchain attribution systems are emerging but nascent**: BRX Provenance (2026) and Soundverse smart contracts exist as pilots.

7. **Neuromorphic and quantum audio remain speculative**: No practical systems for corpus search or synthesis exist on these platforms.

---

## 19. Gaps and Future Research Opportunities

1. **Browser-based CataRT port**: No existing implementation of real-time concatenative synthesis in a browser environment using WASM + AudioWorklets.

2. **Real-time CoSaRef**: The authors explicitly identify lightweight real-time implementation as critical future work.

3. **Multimodal corpus at scale**: ViVo demonstrates audio-visual corpus synthesis, but scaling to million-unit multimodal corpora with CLAP-style embeddings remains unexplored.

4. **Generative corpus quality control**: Automatic filtering of synthetic augmentation samples (Synthio, GAN outputs) for inclusion in concatenative corpora is unsolved.

5. **HRTF corpus spatialization**: No existing system performs concatenative synthesis with HRTF-matched spatial grain placement from a corpus of HRTFs.

6. **Federated corpus building for music**: PartialFL exists for audio-text models, but no system specifically targets distributed concatenative corpus construction.

---

## References (Inline Citations)

[^1^]: Jewel Music, "Web Audio APIs and Browser DAWs," 2025-01-27. https://jewelmusic.art/blog/web-audio-apis-browser-daws/
[^2^]: Jewel Music, ibid.
[^3^]: Emscripten Documentation, "Wasm Audio Worklets API." https://emscripten.org/docs/api_reference/wasm_audio_worklets.html
[^4^]: SuperSonic, "SuperCollider's Synthesis Engine in the Browser." https://sonic-pi.net/supersonic/demo.html
[^5^]: Sam Aaron, "SuperSonic is Ready for Tau5," Patreon, 2025-11-15. https://www.patreon.com/posts/supersonic-is-143646114
[^6^]: CDM, "SuperSonic: SuperCollider synth is fun, playful, colorful, free, in any Web page," 2025-11-15. https://cdm.link/supersonic-supercollider-for-web/
[^7^]: NeuroRave project page. https://neurorave.github.io/neurorave/
[^8^]: ACIDS-IRCAM Projects. https://acids-ircam.github.io/projects/
[^9^]: NVIDIA Developer Blog, "Jetson Project of the Month: Neurorack," 2022-03-14. https://developer.nvidia.com/blog/jetson-neurorack-deep-ai-synthesizer/
[^10^]: Synthtopia, "New Neurorack Module," 2022-01-08. https://www.synthtopia.com/content/2022/01/08/new-neurorack-module-brings-artificial-intelligence-to-your-eurorack-system/
[^11^]: NIME 2023 Proceedings, "Pipeline for recording datasets and running neural models." https://nime.org/proceedings/2023/nime2023_22.pdf
[^12^]: NVIDIA Developer Forums, "Embedded Realtime Neural Audio Synthesis using a Jetson Nano," 2022-12-02. https://forums.developer.nvidia.com/t/embedded-realtime-neural-audio-synthesis-using-a-jetson-nano/236044
[^13^]: Neural Analog, "AFTER: Audio Features Transfer and Exploration in Real-time by IRCAM," 2025-11-19. https://neuralanalog.com/docs/after-model-ircam
[^14^]: arXiv, "Designing Neural Synthesizers for Low-Latency Interaction," 2025-04-11. https://arxiv.org/html/2503.11562v2
[^15^]: Neural Analog, ibid.
[^16^]: HAL Theses, "Extracting lightweight neural networks from large models," 2026-01-29. https://theses.hal.science/tel-05483131v1/file/161300_GENOVA_2025_archivage.pdf
[^17^]: arXiv, "Annotation-Free MIDI-to-Audio Synthesis via Concatenative Synthesis and Generative Refinement," 2024-10-22. https://arxiv.org/abs/2410.16785
[^18^]: arXiv v2, CoSaRef, 2025-06-11. https://arxiv.org/html/2410.16785v2
[^19^]: arXiv, "Audio Inpainting using Discrete Diffusion Model," 2025-07-11. https://arxiv.org/html/2507.08333v1
[^20^]: arXiv, ibid.
[^21^]: HAL, "Video Analysis for Corpus-based Audio–Visual Synthesis (ViVo)." https://hal.science/hal-04576894v1/file/Vivo_Proceedings_JIM-3.pdf
[^22^]: HAL, ibid.
[^23^]: arXiv, "LabelBuddy: An Open Source Music and Audio Language Annotation Tagging Tool Using AI Assistance," 2026-03-04. https://arxiv.org/html/2603.04293v1
[^24^]: Springer, "AudioSet-tools: a Python framework for taxonomy-aware AudioSet curation," 2025-12-02. https://link.springer.com/article/10.1186/s13636-025-00436-z
[^25^]: Medium, "CLAP for Semantic Origin Detection," 2025-12-22. https://medium.com/@balubm_57188/contrastive-language-audio-pretraining-clap-for-semantic-origin-detection-8a2dd149e0c5
[^26^]: HaystackConf 2024, "CLAP With Me: Step by Step Semantic Search on Audio Sources," 2024-04-23. https://haystackconf.com/us2024/talk-11/
[^27^]: TheMusicase, "How CLAP Embeddings Are Changing Music Intelligence," 2026-03-09. https://www.themusicase.com/blog/ai-music-analysis-audio-vectoring-how-clap-embeddings-are-changing-music-intelligence/
[^28^]: arXiv, "Synthio: Augmenting Small-Scale Audio Classification Datasets with Synthetic Data," 2024. https://arxiv.org/html/2410.02056v2
[^29^]: Springer, "An audio generation model based on EMD and GANs," 2025-11-28. https://link.springer.com/article/10.1186/s13636-025-00427-0
[^30^]: Cambridge MPhil Thesis, "Generative Adversarial Networks for Speech Recognition Data Augmentation." https://www.mlmi.eng.cam.ac.uk/files/tianyu_wu_mphil-thesis.pdf
[^31^]: Vapi, "How to Create Natural Audio Using Concatenative Synthesis," 2025-05-30. https://vapi.ai/blog/concatenative-synthesis
[^32^]: Vapi, ibid.
[^33^]: arXiv, "Voice Cloning: Comprehensive Survey," 2025-05-01. https://arxiv.org/html/2505.00579v1
[^34^]: Microsoft Research, VALL-E project page, 2025-05-09. https://www.microsoft.com/en-us/research/project/vall-e-x/
[^35^]: ICMC 2015, "Spatial Modulation Synthesis." https://lifeorange.com/writing/SpatialModulationSynthesis_ICMC2015.pdf
[^36^]: ICSC 2017, "Spectral and 3D spatial granular synthesis in Csound." https://csound.com/icsc2017/proceedings/ICSC2017_paper_Di.Liscia.pdf
[^37^]: EAA/DAGA 2025, "HRTF Database Matching for Localization Accuracy." https://dael.euracoustics.org/confs/fa2025/data/articles/000434.pdf
[^38^]: Brandenburg Labs, "Introduction to HRTF," 2025-10-23. https://brandenburg-labs.com/introduction-to-head-related-transfer-function-hrtf/
[^39^]: SingleStore, "Ultimate Guide to Vector Database Landscape 2024," 2025-01-15. https://www.singlestore.com/blog/-ultimate-guide-vector-database-landscape-2024/
[^40^]: SingleStore, ibid.
[^41^]: Meegle, "Neuromorphic Audio Systems," 2026-02-07. https://www.meegle.com/en_us/topics/neuromorphic-engineering/neuromorphic-audio-systems
[^42^]: Meegle, ibid.
[^43^]: arXiv, "HPCNeuroNet: Advancing Neuromorphic Audio Signal Processing," 2023-11-21. https://arxiv.org/abs/2311.12449
[^44^]: Elprocus, "Top Neuromorphic Chips in 2025," 2025-08-02. https://www.elprocus.com/top-neuromorphic-chips-in-2025/
[^45^]: SpinQuanta, "Grover's Algorithm," 2025-01-28. https://www.spinquanta.com/news-detail/grovers-algorithm-how-it-speeds-up-quantum-search20250123082524
[^46^]: Scott Aaronson blog, 2023-03-22. https://scottaaronson.blog/?p=7143
[^47^]: Departure Music, "Quantum Computing for Audio Processing," 2025-08-22. https://www.departuremusic.com/quantum-computing-for-audio-processing/
[^48^]: DZone, "Federated Learning," 2025-09-26. https://dzone.com/articles/federated-learning-training-models-without-sharing
[^49^]: arXiv, "Partial Federated Learning," 2024-03-03. https://arxiv.org/html/2403.01615v1
[^50^]: MEXC, "Music Certification on Blockchain with AI," 2026-03-07. https://www.mexc.com/news/874666
[^51^]: MEXC, ibid.
[^52^]: Soundverse, "Smart Contracts for Music Royalties," 2026-02-10. https://www.soundverse.ai/blog/article/smart-contracts-for-music-royalties-explained-0059
[^53^]: arXiv, "SoundStream," 2021-07-07. https://arxiv.org/abs/2107.03312
[^54^]: Google Research Blog, "SoundStream," 2021-08-12. https://research.google/blog/soundstream-an-end-to-end-neural-audio-codec/
[^55^]: arXiv, "High Fidelity Neural Audio Compression (EnCodec)," 2022-10-24. https://arxiv.org/abs/2210.13438
[^56^]: AudioDec Demo, Meta Reality Labs. https://bigpon.github.io/AudioDec_demo/
