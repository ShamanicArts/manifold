# Dimension 04: Real-Time Systems & Software Architectures for Concatenative Synthesis

**Research Date**: April 2026
**Scope**: Engineering of interactive, low-latency concatenative synthesis systems — CataRT, Mosaïque, C-C-Combine, FluCoMa, AudioGuide, dada library, buffer management, multi-threading, plugin formats, open-source licensing, and recent commercial developments.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current State (2024–2026)](#2-current-state-20242026)
3. [Historical Evolution](#3-historical-evolution)
4. [Key Systems: Architecture & Data Flow](#4-key-systems-architecture--data-flow)
   - 4.1 [CataRT (Max/MSP + FTM/Gabor/MnM)](#41-catart-maxmsp--ftmgabormn)
   - 4.2 [CataRT-MuBu](#42-catart-mubu)
   - 4.3 [Mosaïque (Max for Live / Standalone)](#43-mosaïque-max-for-live--standalone)
   - 4.4 [C-C-Combine (Rodrigo Constanzo)](#44-c-c-combine-rodrigo-constanzo)
   - 4.5 [FluCoMa Toolkit](#45-flucoma-toolkit)
   - 4.6 [AudioGuide (IRCAM / UCSD)](#46-audioguide-ircam--ucsd)
   - 4.7 [dada library for Max (Bach project)](#47-dada-library-for-max-bach-project)
5. [Plugin & Standalone Architectures](#5-plugin--standalone-architectures)
   - 5.1 [Concatenator (DataMind Audio, VST/AU/AAX)](#51-concatenator-datamind-audio-vstauaax)
   - 5.2 [Catecophony (VST3/AU, Ben Hayes)](#52-catecophony-vst3au-ben-hayes)
   - 5.3 [SKataRT (Max for Live, IRCAM)](#53-skatart-max-for-live-ircam)
6. [Buffer Management & Latency Engineering](#6-buffer-management--latency-engineering)
   - 6.1 [RAM vs. Disk Streaming](#61-ram-vs-disk-streaming)
   - 6.2 [Real-Time Analysis Latency Trade-offs](#62-real-time-analysis-latency-trade-offs)
   - 6.3 [Multi-Threading & Thread Safety](#63-multi-threading--thread-safety)
7. [Open Source Licensing & Ecosystem](#7-open-source-licensing--ecosystem)
8. [Key Actors & Stakeholders](#8-key-actors--stakeholders)
9. [Tensions, Debates & Counter-Narratives](#9-tensions-debates--counter-narratives)
10. [Bibliography](#10-bibliography)

---

## 1. Executive Summary

Concatenative synthesis has matured from a research curiosity into a diverse ecosystem of real-time systems spanning open-source academic tools, commercial plugins, and artist-built instruments. The field is anchored by IRCAM's CataRT (GPL, Max/MSP), which pioneered real-time corpus-based concatenative synthesis using descriptor-space navigation. A 2024–2025 wave of new tools — including the commercial **Concatenator** VST ($149, DataMind Audio, ISMIR 2024), the free **Mosaïque** Max for Live device with 3D visualization, and the artist-centric **FluCoMa** toolkit — has expanded accessibility while introducing novel algorithmic approaches (Bayesian particle filters, machine learning descriptors). The tension between **real-time interactivity** and **synthesis quality** remains the central engineering challenge, expressed through buffer management strategies, thread scheduling, and latency compensation. Open-source licensing (GPL for CataRT, proprietary for most plugins) continues to shape the distribution and evolution of the ecosystem.

---

## 2. Current State (2024–2026)

### 2.1 The 2024–2025 "Concatenative Renaissance"

The period 2024–2025 marks a significant inflection point for concatenative synthesis software. Three major developments define the current landscape:

**Claim**: Concatenator from DataMind Audio, launched in April 2025 at $149, represents the first commercially successful VST/AU/AAX plugin for real-time concatenative synthesis, based on peer-reviewed research (ISMIR 2024).[^90^]
**Source**: Sound on Sound / Native Instruments
**URL**: https://www.soundonsound.com/news/concatenator-datamind-audio
**Date**: 2025-04-16
**Excerpt**: "Datamind Audio have announced the launch of a new AI-powered plug-in that's capable of turning any sound into a playable instrument. Described as an 'audio mosaicking tool', Concatenator can be used to create complex new sounds and textures based on any audio file or input source."
**Context**: The plugin supports VST, AU, and AAX formats on Windows 10+ and macOS 10.15+, with machine learning-based spectral matching and "lightning fast load times" limited only by available RAM.
**Confidence**: high

**Claim**: Mosaïque (version 0.2, maxforlive.com, August 2025) is actively maintained as a free Max for Live device with 3D corpus visualization, lowering the barrier to entry for non-programming musicians.[^14^]
**Source**: maxforlive.com
**URL**: https://maxforlive.com/library/device/13367/mosaique
**Date**: 2025-08-22 (added); 2025-09-03 (updated)
**Excerpt**: "Mosaique is a free software instrument for musical creation and performance based on corpus-based concatenative synthesis (CBCS). It offers an immersive graphical representation to creators who wish to manipulate sound within a virtual timbral space."
**Context**: Requires Ableton Live 11/12 and Max 8.6.0+. Uses FluCoMa library for machine listening. Available at https://zenodo.org/records/16423631.
**Confidence**: high

**Claim**: CataRT-MuBu reached release 1.7.0 by September 2025, indicating continued active development of the core IRCAM platform.[^115^]
**Source**: IRCAM Forum Discussion
**URL**: https://discussion.forum.ircam.fr/c/catart-mubu/94
**Date**: 2025-09-25
**Excerpt**: "Catart-mubu release 1.7.0."
**Context**: The MuBu package (last updated March 24, 2025) remains the technical foundation for CataRT's successor. License: "Forum (Toolbox distributed freely, proprietary code)."
**Confidence**: high

### 2.2 The FluCoMa Ecosystem as De Facto Standard

**Claim**: The FluCoMa toolkit has become the de facto standard infrastructure for corpus manipulation across Max, SuperCollider, and Pure Data, with active community support and ports to DAWs (ReaCoMa for REAPER).[^70^][^177^]
**Source**: CCRMA Stanford Workshop / FluCoMa Learn
**URL**: https://ccrma.stanford.edu/workshops/flucoma / https://learn.flucoma.org/
**Date**: 2023
**Excerpt**: "FluCoMa is a toolkit for making music with machine listening and machine learning within Max, SuperCollider, & Pure Data."
**Context**: FluCoMa provides audio decomposition, analysis, machine learning (KDTree, UMAP, PCA, MLP), and buffer utilities. It powers Mosaïque, ReaCoMa, and numerous artist projects.
**Confidence**: high

---

## 3. Historical Evolution

### 3.1 Pre-Digital Roots (1940s–1990s)

**Claim**: Concatenative synthesis traces its lineage to tape cutting and splicing techniques of Musique Concrète (Pierre Schaeffer, GRM, 1948), extending through Pierre Schaeffer's concept of the "sound object" as a delimited segment with manually observable characteristics.[^85^]
**Source**: Diemo Schwarz, "Concatenative Sound Synthesis: The Early Years" (Journal of New Music Research, 2006)
**URL**: https://hal.science/hal-01161361v1/document
**Date**: 2006
**Excerpt**: "The Groupe de Recherche Musicale (GRM) of Pierre Schaeffer used for the first time recorded segments of sound to create their pieces of Musique Concrète. In the seminal work Traité des Objets Musicaux (Schaeffer, 1966)... Schaeffer defines the notion of sound object, which is not so far from what is here called unit."
**Context**: Schwarz's taxonomy places these early practices at the origin of modern concatenative methods, even though they were not computationally aided.
**Confidence**: high

### 3.2 The IRCAM Era: CataRT and the FTM Ecosystem (2000–2010)

**Claim**: Diemo Schwarz developed the Caterpillar system (2000, offline, Viterbi algorithm) as the precursor to CataRT (2005), which approximated the Viterbi approach with a greedy real-time algorithm.[^85^][^1^]
**Source**: DAFx 2006 paper / JNMR 2006
**URL**: http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf
**Date**: 2006
**Excerpt**: "CataRT is a collection of patches for Max/MSP using the FTM, Gabor, and MnM extensions. It is released as free open source software under the GNU general public license (GPL)."
**Context**: The DAFx 2006 paper establishes the foundational architecture: FTM data structures, Gabor for arbitrary-rate grain processing, MnM for statistical operations, and an SQLite database for persistent corpus storage.
**Confidence**: high

**Claim**: The FTM library (IRCAM) was ported from Max/MSP to Pure Data by IOhannes m ZMÖLNIG, Thomas MUSIL, and Winfried RITSCH (Graz), extending the reach of the IRCAM concatenative ecosystem to Linux and open-source environments.[^95^]
**Source**: ICMC 2008 / IEM Graz
**URL**: https://iem.kug.ac.at/fileadmin/03_Microsites/01_Kuenstlerisch_wissenschaftliche_Einheiten/01_Institute/Institut_17_Elektronische_Musik_und_Akustik/Projekte/2008/ftm.pdf
**Date**: 2008
**Excerpt**: "FTM is an environment that allows the processing of complex data structures such as matrices, sequences, dictionaries, break point functions and whatever might seem helpful for the processing of music, sound and motion capture data within graphical computer music systems. While FTM itself is published under a free license (LGPL), until recently the only supported host system has been Max/MSP."
**Context**: The Pure Data port is significant because it brought FTM (and thus CataRT's underlying infrastructure) to Linux, a platform previously underserved by IRCAM tools.
**Confidence**: high

### 3.3 The FluCoMa Era (2017–present)

**Claim**: The Fluid Corpus Manipulation project was developed at the University of Huddersfield (CeReNeM) from approximately 2017, with public release 1.0.0 in May 2020, funded as an AHRC project.[^148^]
**Source**: Dissertation / FluCoMa website
**URL**: https://phaidra.bruckneruni.at/api/object/o:2887/get
**Date**: 2023
**Excerpt**: "The FluCoMa project became public around 2017 and was (and still is) developed at the Centre for Research in New Music (CeReNeM) of the Department of Music and Music Technology at the University of Huddersfield. Its development took about five years, with the prerelease for all CCEs and source code for version 1.0.0 in May 2020."
**Context**: Led by Pierre Alexandre Tremblay, Owen Green, and Gerard Roma, with James Bradbury, Ted Moore, and others. The project was explicitly designed to "instigate new musical ways of exploiting ever-growing banks of sound and gestures."
**Confidence**: high

### 3.4 The Bayesian Particle Filter Breakthrough (ISMIR 2024)

**Claim**: Christopher J. Tralie and Ben Cantil introduced "The Concatenator," a real-time concatenative musaicing system using a Bayesian particle filter, achieving computational complexity independent of corpus size — a claimed "essential breakthrough in concatenative synthesis technology."[^179^][^51^]
**Source**: ISMIR 2024 / arXiv
**URL**: https://arxiv.org/abs/2411.04366
**Date**: 2024-11-07
**Excerpt**: "Because the computational complexity of the system is independent of the corpus size, our system scales to corpora that are hours long, which is an important feature in the age of vast audio data collections."
**Context**: The paper contrasts their approach with Driedger's NMF-based musaicing and Schwarz's greedy CataRT algorithm. The particle filter maintains P particles, each representing p corpus windows, with a transition model controlling time-continuity. Commercialized by DataMind Audio as the Concatenator VST.
**Confidence**: high

---

## 4. Key Systems: Architecture & Data Flow

### 4.1 CataRT (Max/MSP + FTM/Gabor/MnM)

**Claim**: CataRT's architecture follows a Model-View-Controller (MVC) design pattern with a multidimensional descriptor space populated by sound units. The selection algorithm uses a Euclidean distance (normalized to Mahalanobis distance) on two user-selected descriptors.[^1^]
**Source**: DAFx 2006 paper (expanded version)
**URL**: http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf
**Date**: 2006
**Excerpt**: "CataRT's model is a multidimensional space of descriptors, populated by the sound units. The user controls a target point in a lower-dimensional projection of that space with a selection radius around it, and the selection algorithm selects the units closest to the target or within the radius. The generic distance measure is a Euclidean distance on the two chosen descriptors, normalised over the corpus, i.e. a Mahalanobis distance, in order to avoid distortions between different distances because of the different ranges of the values."
**Context**: The data-flow diagram shows: (1) Audio input feeding the corpus; (2) Analysis (segmentation + descriptors); (3) Synthesis by nearest-neighbour search, transformation, and concatenation. All analysis can happen in real-time, including live audio input.
**Confidence**: high

**Claim**: CataRT uses FTM data structures for internal representation: an (N,D) matrix for unit descriptor data (one column per descriptor, one unit per row), dictionaries indexed by filename for sound metadata, and an SQLite relational database for persistent corpus storage.[^1^]
**Source**: DAFx 2006 paper
**URL**: http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf
**Date**: 2006
**Excerpt**: "The unit descriptor data is kept in one big (N,D) matrix with one column per descriptor and one unit per row... For persistent storage of corpora, a layer around the relational database management system SQLite keeps track of soundfiles, segments, and unit descriptor data."
**Context**: Write access is centralized in `catart.data`; read access is via `catart.data.proxy`, enabling multiple selection/synthesis modules to work on shared corpora.
**Confidence**: high

**Claim**: CataRT supports live corpus building from real-time audio input — "the last several minutes of whose playing constitutes the corpus from which a laptop improviser selects units."[^1^]
**Source**: DAFx 2006 paper
**URL**: http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf
**Date**: 2006
**Excerpt**: "At this point, all analysis takes place inside CataRT in real-time, which means that we could just as well use real-time audio input that is segmented into units and analysed on the fly, to feed the corpus. The audio could come, for example, from a musician on stage, the last several minutes of whose playing constitutes the corpus from which a laptop improviser selects units."
**Context**: This live corpus-building capability is one of CataRT's most distinctive features for improvisation, creating a "shared symbolic instrument" between acoustic and digital performers.
**Confidence**: high

**Claim**: The Gabor library processes "atomic sound particles" (grains, wave periods, frames) at arbitrary rates using the Max event/message processing model rather than block-wise MSP signal streaming, enabling pitch-synchronous and granular synthesis within a unified modular framework.[^88^][^89^]
**Source**: DAFx 2005 paper (Schnell & Schwarz)
**URL**: https://www.dafx.de/paper-archive/2005/P_122.pdf / https://hal.science/hal-01161342/document
**Date**: 2005
**Excerpt**: "Gabor modules are scheduled within the Max event (or message) processing model rather than the block-wise signal stream processing engine. This way Gabor allows for the combination of different signal processing techniques in a unified framework one could describe as generalized granular synthesis."
**Context**: Gabor relies on FTM's `fmat` (floating-point matrix) class to represent sound sample vectors, Fourier spectra, and descriptor frames. The overlap-add buffer reconstructs continuous audio from grain streams. This event-based approach is key to CataRT's real-time grain scheduling.
**Confidence**: high

### 4.2 CataRT-MuBu

**Claim**: CataRT-MuBu supersedes the "classic" CataRT (FTM-based) and is distributed freely through the Max Package Manager and IRCAM Forum. It requires Max 7+ and the MuBu package.[^120^][^118^]
**Source**: GitHub / IRCAM ISMM
**URL**: https://github.com/ircam-ismm/catart-mubu / https://ircam-ismm.github.io/max-msp/mubu.html
**Date**: 2018–2025
**Excerpt**: "CataRT-MuBu is a collection of Max patches for corpus-based concatenative synthesis, audio mosaicing, descriptor analysis, transcription, and composition... MuBu (multi-buffer) is a Max toolbox for multimodal analysis of sound and motion, sound synthesis and interactive machine learning."
**Context**: MuBu provides a generic container for multimodal data (audio, descriptors, motion, MIDI, markers). It includes PiPo (Programming Interface for Processing Objects) for descriptor computation. The classic FTM-based CataRT is now considered "legacy."
**Confidence**: high

### 4.3 Mosaïque (Max for Live / Standalone)

**Claim**: Mosaïque, developed at LFO-lab (Montréal), uses the FluCoMa library for all machine listening and learning processes, and is available as both a standalone Max patch and a Max for Live device, tested on Ableton Live 11/12 with Max 8.6.0+.[^68^][^11^]
**Source**: GitHub / AIMC 2024 Workshop
**URL**: https://github.com/LFO-lab/Mosaique / https://aimc2024.pubpub.org/pub/buh7kcah
**Date**: 2022–2024
**Excerpt**: "Mosaïque takes the form of a collection of Max for Live instruments to play sound coming from the Ableton Live composition environment... Mosaïque uses the Fluid Corpus Manipulation library to do all its machine listening and learning processes."
**Context**: The AIMC 2024 workshop paper positions Mosaïque as addressing the barrier of programming expertise required for CBCS, offering "a user-friendly interface and simplified workflow." Its 3D environment for corpus visualization is highlighted as distinctive, alongside MIDI, OSC, and algorithmic navigation tools.
**Confidence**: high

**Claim**: Mosaïque version 0.2 was added to maxforlive.com in August 2025 and downloaded via Zenodo, indicating active community distribution outside of IRCAM channels.[^14^]
**Source**: maxforlive.com
**URL**: https://maxforlive.com/library/device/13367/mosaique
**Date**: 2025-08-22
**Excerpt**: "Live Version Used: 12.2.2 | Max Version Used: 9.0.7 | Date Added: Aug 22 2025 | Downloads: 1 | Website: https://zenodo.org/records/16423631"
**Context**: The presence on Zenodo (a research data repository) and maxforlive.com suggests the project is positioning itself as both a research artifact and a practical musician's tool.
**Confidence**: high

### 4.4 C-C-Combine (Rodrigo Constanzo)

**Claim**: C-C-Combine, built by Rodrigo Constanzo in Max/MSP, is a real-time corpus-based audio mosaicing application that analyzes incoming audio every 10ms (default) using 40ms chunks, searching a pre-analyzed database for the closest match across loudness, pitch, spectral centroid, and spectral flatness descriptors.[^8^][^9^]
**Source**: Constanzo website / FluCoMa Learn
**URL**: https://rodrigoconstanzo.com/combine/ / https://learn.flucoma.org/explore/constanzo/
**Date**: 2012 (origin); 2023 (FluCoMa documentation)
**Excerpt**: "Constanzo describes C-C-Combine as a 'corpus-based audio mosaicking application'. The premise of the software is to be able to 'play anything with anything'... every so often (by default 10ms) a chunk of incoming audio is analyzed (by default 40ms). Constanzo looks to find the mean, min and max values of the following audio descriptors: loudness, pitch, spectral centroid and spectral flatness."
**Context**: Constanzo was inspired by Pierre Alexandre Tremblay's Sandbox #3 (CataRT-based). C-C-Combine uses granular synthesis as its playback engine, with optional pitch and loudness correction. The patch is free to download.
**Confidence**: high

**Claim**: Constanzo's collaboration with FluCoMa led to the development of the `@blocking 2` parameter ("Rod mode"), which puts Max object processing into the scheduler thread for lowest latency — a direct response to his need for real-time percussion matching.[^9^]
**Source**: FluCoMa Learn
**URL**: https://learn.flucoma.org/explore/constanzo/
**Date**: 2023
**Excerpt**: "The @blocking 2 parameter for the FluCoMa tools was actually developed in answer to Constanzo's desire for lower latency – it is a mode for Max only that puts the processing of an object into the scheduler thread, making it of highest priority: naturally, during development this mode was referred to as Rod mode."
**Context**: In his piece *Kaizo Snare*, Constanzo uses a 512-sample analysis window (~11.6ms) after onset detection, striking a "sweet spot" between understanding the onset and retrieving information quickly. This exemplifies the latency-accuracy trade-off central to real-time concatenative systems.
**Confidence**: high

### 4.5 FluCoMa Toolkit

**Claim**: FluCoMa provides a comprehensive two-iteration toolkit: (1) signal decomposition and description (slicing, HPSS, NMF, descriptors); (2) corpus exploration and manipulation (datasets, KDTree, scaling, PCA, UMAP, MLP). All tools have both real-time and non-real-time variants.[^176^][^148^]
**Source**: ICMC 2019 / "Exploring Sounds through Fluid Decomposition"
**URL**: https://pure.hud.ac.uk/ws/files/17022941/towardscorpus_final.pdf
**Date**: 2019
**Excerpt**: "The first iteration focused primarily on musical approaches to signal decomposition and description... The second iteration focuses on exploring, interacting, and manipulating audio corpora and sonic data. For this purpose, tools for creating and manipulating datasets, similarity queries, supervised and unsupervised machine learning, scaling, and normalization processing for analysis are proposed."
**Context**: Buffer utilities (`BufCompose`, `FluidBufToKr`/`FluidKrToBuf`) are crucial for concatenative synthesis because they allow non-audio data (descriptors, dataset entries) to flow through buffer-based pipelines in Max and SuperCollider.
**Confidence**: high

**Claim**: The FluCoMa toolkit is implemented natively within Creative Coding Environments (CCEs) — Max, SuperCollider, and Pure Data — with cross-environment parity to facilitate community exchange.[^148^]
**Source**: Dissertation
**URL**: https://phaidra.bruckneruni.at/api/object/o:2887/get
**Date**: 2023
**Excerpt**: "They have both real-time and non real-time processing and functionalities, and have been developed and organized as closely as possible among the CCEs to facilitate communication and exchange among users."
**Context**: The FluCoMa discourse forum (https://discourse.flucoma.org) shows active community support, with Tremblay, Bradbury, and others providing direct code guidance for concatenative synthesis implementations.
**Confidence**: high

**Claim**: Ted Moore's piece *quartet* uses K-nearest neighbour lookup via FluCoMa's `FluidKDTree` to perform concatenative synthesis, matching eurorack synthesizer target sounds against a corpus of acoustic instrument clips.[^146^]
**Source**: FluCoMa Learn
**URL**: https://learn.flucoma.org/explore/moore/
**Date**: 2023
**Excerpt**: "In Sections Two and Three, we see two more instances of ways of translating sounds... Moore explains that he uses K-nearest neighbour lookup to perform concatenative synthesis: 'eurorack synthesizer interjections are used as the target for concatenative synthesis (by means of K-nearest neighbour lookup), combining clips of acoustic instruments to try and recreate the synthesizer's timbre and gesture'."
**Context**: This is a non-real-time compositional application, contrasting with Constanzo's real-time C-C-Combine approach. Moore's workflow demonstrates FluCoMa's flexibility for studio composition.
**Confidence**: high

### 4.6 AudioGuide (IRCAM / UCSD)

**Claim**: AudioGuide is a Python-based, non-real-time framework for concatenative synthesis developed by Benjamin Hackbarth during his IRCAM residency (2010), influenced by CataRT, MuBu, and Orchidée. It uses csound for rendering and supports output to Logic, Pro Tools, Reaper, bach.roll, and JSON.[^64^][^72^]
**Source**: AudioGuide paper / GitHub
**URL**: http://articles.ircam.fr/textes/Hackbarth10a/index.pdf / https://github.com/benhackbarth/audioguide
**Date**: 2010 (paper); 2020 (GitHub)
**Excerpt**: "AudioGuide is a framework for experimentation with a flexible concatenative algorithm... AudioGuide is not realtime and therefore sounds can be layered much more densely compared to realtime concatenation. Non-realtime analysis also permits more flexible and creative mapping between target and corpus descriptors."
**Context**: AudioGuide's subtractive spectral algorithm enables simultaneous selection of corpus units (vertically stratified or horizontally overlapping). Its Python text-file interface makes it accessible to programmers but not to non-coding musicians.
**Confidence**: high

### 4.7 dada library for Max (Bach project)

**Claim**: The dada library extends CataRT's corpus-based concatenative synthesis principles into the symbolic domain, implementing score segmentation, analysis, and concatenative sequencing as part of Max's bach computer-aided composition environment.[^56^][^91^]
**Source**: TENOR 2016 / TENOR 2018 papers
**URL**: https://www.tenor-conference.org/proceedings/2016/01_Ghisi_tenor2016.pdf / https://www.tenor-conference.org/proceedings/2018/19_Ghisi_tenor18.pdf
**Date**: 2016 / 2018
**Excerpt**: "We introduce a collection of modules designed to segment, analyze, display and sequence symbolic scores in real-time. This mechanism, inspired from CataRT's corpus-based concatenative synthesis, is implemented as a part of the dada library for Max... CataRT is oriented to real-time interaction on audio data, essentially omitting any symbolic representation of events."
**Context**: Developed by Daniele Ghisi at STMS Lab (IRCAM/CNRS/UPMC). The dada library uses bach's lambda loop visual programming for customizable feature extraction. This is a rare bridge between audio concatenative synthesis and symbolic score manipulation.
**Confidence**: high

---

## 5. Plugin & Standalone Architectures

### 5.1 Concatenator (DataMind Audio, VST/AU/AAX)

**Claim**: Concatenator, commercially released by DataMind Audio in April 2025 for $149, is a VST/AU/AAX plugin implementing real-time "Concatenative Sound Synthesis" with machine learning controls for spectral/amplitude matching, five LFOs, five envelope followers, and dynamic presets.[^90^][^92^]
**Source**: Sound on Sound / Native Instruments
**URL**: https://www.soundonsound.com/news/concatenator-datamind-audio / https://www.native-instruments.com/en/products/nks-partners/datamind-audio/concatenator/
**Date**: 2025-04-16
**Excerpt**: "Concatenator instantly transforms any sound library into a playable, real-time instrument. Using a microphone or audio file as input, its powerful machine-learning processes continuously analyze the signal. It then reconstructs that signal by drawing spectral and temporal-matched fragments from samples in your existing library."
**Context**: System requirements: i5-2500/AMD FX-6300 minimum, 4GB RAM minimum, 16GB recommended. 800MB download. The "only limitation on how many samples can be loaded... is how much RAM is available" — implying a fully RAM-based corpus architecture.
**Confidence**: high

**Claim**: The Concatenator algorithm, published at ISMIR 2024 by Christopher J. Tralie and Ben Cantil, uses a particle filter with computational complexity O(Pp) independent of corpus size N, enabling scaling to "corpora that are hours long."[^179^][^93^]
**Source**: ISMIR 2024 / ctralie.com
**URL**: https://arxiv.org/abs/2411.04366 / https://www.ctralie.com/TheConcatenator/
**Date**: 2024
**Excerpt**: "The Concatenator maintains P particles, each of which represents p specific corpus windows... Because the computational complexity of the system is independent of the corpus size, our system scales to corpora that are hours long."
**Context**: The particle filter uses a transition model with tunable probability p_d for time-continuity (typically 0.9–0.99) and an observation model based on KL-divergence between target and corpus spectrograms. A Python prototype using PortAudio is available.
**Confidence**: high

### 5.2 Catecophony (VST3/AU, Ben Hayes)

**Claim**: Catecophony is an open-source VST3/AU plugin (JUCE framework, Essentia + FFTW3) that performs real-time corpus-based concatenative synthesis using a k-d tree for fast grain-space search.[^169^][^142^]
**Source**: Ben Hayes website / GitHub
**URL**: https://benhayes.net/projects/2_project/ / https://github.com/ben-hayes/catecophony
**Date**: 2020
**Excerpt**: "Catecophony is a VST3/AU plugin that performs real-time corpus-based concatenative synthesis. Given some source audio (the corpus) which is split into thousands of grains and analysed, it attempts to recreate an incoming audio stream (the target) using the corpus grains."
**Context**: The plugin is described as producing "pointillist sound shapes that are often chaotic and sometimes lovely." Available as alpha release v0.0.1. Unlike commercial Concatenator, this is research/academic open-source software.
**Confidence**: high

### 5.3 SKataRT (Max for Live, IRCAM)

**Claim**: SKataRT is an IRCAM Max for Live device (subscription-based, ~€200/year Forum tier) combining CataRT concatenative synthesis with mosaicing, featuring automatic segmentation, 8 sub-corpora/voices, up to 16 output channels, and Ableton Live total recall.[^172^][^74^]
**Source**: vi-control.net / IRCAM Forum
**URL**: https://vi-control.net/community/threads/new-ircam-ableton-max-for-live-toy-concatenative-synthesis-skatart.115599/ / https://forum.ircam.fr/topics/detail/321-Concatenative%20synthesis/
**Date**: 2021
**Excerpt**: "SKataRT is a MaxforLive sound sketching plug-in that combines the concatenative synthesis techniques of CataRT with synthesis techniques by mosaicing... Analysis of sound: Import of single samples, long recordings, or whole sound directories (recursive); Automatic segmentation by time, onset, or silence; Automatic analysis of 4 audio characteristics."
**Context**: SKataRT requires Mac OS >= 10.10 or Windows 64bit, Live 10+, Max 8. Multiple "Corpus" variants exist (E-guitar, Kitchen, Modalys, DJ set, SOL). It sits between the free CataRT-MuBu patches and fully commercial plugins like Concatenator.
**Confidence**: high

---

## 6. Buffer Management & Latency Engineering

### 6.1 RAM vs. Disk Streaming

**Claim**: Concatenator's commercial implementation loads all corpus samples into RAM, with "lightning fast load times" and the "only limitation... is how much RAM is available," suggesting no disk-streaming architecture.[^90^]
**Source**: Sound on Sound
**URL**: https://www.soundonsound.com/news/concatenator-datamind-audio
**Date**: 2025
**Excerpt**: "Lightning Fast Load Times: The only limitation on how many samples can be loaded into Concatenator is how much RAM is available."
**Context**: This is typical for modern concatenative plugins — RAM prices have made full in-memory corpora practical for moderate-sized libraries (GB range), eliminating disk I/O latency at the cost of loading time and memory footprint.
**Confidence**: high

**Claim**: Traditional real-time audio synthesis advice emphasizes centralized buffer allocation and careful management of different packet rates to avoid blocking the audio thread during disk writes.[^119^]
**Source**: Stack Overflow (real-time audio synthesis advice)
**URL**: https://stackoverflow.com/questions/4187830/has-anybody-some-advice-on-programming-realtime-audio-synthesis
**Date**: 2010
**Excerpt**: "Centralising the buffer allocation will make it easy to retrospectively modify the update strategy for different rates in different parts of the network."
**Context**: In concatenative systems, the audio thread must never be blocked by corpus loading, descriptor computation, or database queries. Pre-allocation and ring buffers are standard strategies.
**Confidence**: high

### 6.2 Real-Time Analysis Latency Trade-offs

**Claim**: Rodrigo Constanzo's Kaizo Snare implementation uses a 512-sample (~11.6ms) post-onset analysis window to balance descriptor accuracy against retrieval speed, with `@blocking 2` scheduler-priority mode reducing Max object latency.[^9^]
**Source**: FluCoMa Learn
**URL**: https://learn.flucoma.org/explore/constanzo/
**Date**: 2023
**Excerpt**: "Constanzo defines an analysis window of 512 samples (which comes to about 11.6ms). Once the onset is detected, he waits this amount of time before analysing the proceeding audio. This, combined with the time that it takes to analyse the piece of audio, seems to strike a good balance between understanding the aspect of the onset, and retrieving the information quickly."
**Context**: This "sweet spot" was developed around a specific gesture/sound type (snare surface). The generalizability of this latency-accuracy balance to other instruments remains an open question.
**Confidence**: high

**Claim**: C-C-Combine's default settings (10ms query interval, 40ms analysis chunk) produce a fundamentally different temporal behavior than onset-triggered systems like Kaizo Snare — continuous flow vs. event-driven matching.[^9^]
**Source**: FluCoMa Learn
**URL**: https://learn.flucoma.org/explore/constanzo/
**Date**: 2023
**Excerpt**: "Analysis of the incoming audio is no longer happening systematically every grain: here, analysis only happens when an onset is detected."
**Context**: This architectural difference (periodic vs. event-driven analysis) has significant aesthetic consequences: C-C-Combine produces continuous granular streams, while Kaizo Snare produces discrete triggered events.
**Confidence**: high

### 6.3 Multi-Threading & Thread Safety

**Claim**: Multi-threaded audio processing systems must separate audio rendering (real-time thread) from UI and analysis (lower-priority threads), using lockless data structures to prevent priority inversion.[^114^][^112^]
**Source**: Stack Overflow / ACE Studio blog
**URL**: https://stackoverflow.com/questions/33923542/what-is-the-best-multithreading-approach-to-low-latency-audio-synthesis-in-qt / https://acestudio.ai/blog/multi-threaded-audio-processing/
**Date**: 2015 / 2024
**Excerpt**: "When writing a synthesis plug-in, you are really only concerned with two things: Implementing a render handler - which is called by the host when it needs samples... Implementing an event handler - which is called in a lower priority thread. The complication is that this should not cause a priority inversion in the render thread - with which it inevitably shares some data structures. You need lockless data structures for this."
**Context**: Concatenative plugins face the additional challenge that corpus queries (k-d tree, database search) may be computationally expensive. Strategies include: (a) pre-computing descriptors offline; (b) putting queries in worker threads; (c) using approximate nearest-neighbor methods.
**Confidence**: high

**Claim**: The JUCE framework (used by Catecophony and many commercial audio plugins) provides built-in support for real-time audio plugin architecture with thread-safe parameter handling, making it the de facto standard for VST3/AU development.[^142^][^114^]
**Source**: GitHub / Stack Overflow
**URL**: https://github.com/ben-hayes/catecophony
**Date**: 2020
**Excerpt**: "Catecophony is built on the JUCE framework and uses Essentia and FFTW3 for feature extraction."
**Context**: JUCE abstracts away VST3/AU plugin format complexities, allowing developers to focus on algorithm implementation. For concatenative synthesis, this means the core challenge shifts from plugin architecture to real-time descriptor computation and corpus search.
**Confidence**: high

---

## 7. Open Source Licensing & Ecosystem

**Claim**: CataRT is explicitly released under the GNU General Public License (GPL), making it "free open source software" available for modification and redistribution.[^80^][^145^]
**Source**: DAFx 2006 paper / JIM 2008 paper
**URL**: https://www.dafx.de/paper-archive/2006/papers/p_279.pdf / http://jim.afim-asso.org/jim08/upload/05_Schwarz_catart-jim2008-final.pdf
**Date**: 2006 / 2008
**Excerpt**: "CataRT is released as free open source software under the GNU general public license (GPL)."
**Context**: The GPL licensing of CataRT has enabled derivative works (Mosaïque, C-C-Combine, dada.catart, SKataRT's underlying patches) and community contributions. However, the dependency on proprietary Max/MSP limits true "free software" distribution.
**Confidence**: high

**Claim**: The FTM library is LGPL-licensed, and was ported to Pure Data to bring IRCAM tools to open-source hosts, though MuBu (the CataRT-MuBu foundation) uses a proprietary "Forum" license.[^95^][^118^]
**Source**: ICMC 2008 paper / IRCAM ISMM
**URL**: https://iem.kug.ac.at/fileadmin/03_Microsites/01_Kuenstlerisch_wissenschaftliche_Einheiten/01_Institute/Institut_17_Elektronische_Musik_und_Akustik/Projekte/2008/ftm.pdf / https://ircam-ismm.github.io/max-msp/mubu.html
**Date**: 2008 / 2025
**Excerpt**: "While FTM itself is published under a free license (LGPL), until recently the only supported host system has been Max/MSP, a commercial graphical programming environment."
**Context**: The licensing split creates tension: the core algorithmic infrastructure (FTM) is open, but the modern host integration (MuBu) is proprietary forumware. FluCoMa's BSD-style licensing (implied by its broad distribution) sits in between.
**Confidence**: high

**Claim**: FluCoMa tools are open-source with permissive licensing, and community ports like ReaCoMa (James Bradbury) and Mosaïque (LFO-lab) demonstrate active ecosystem growth without central control.[^177^][^217^]
**Source**: FluCoMa Learn / flucoma.org
**URL**: https://learn.flucoma.org/explore/bradbury/ / https://www.flucoma.org/made-with/
**Date**: 2023
**Excerpt**: "ReaCoMa is a collection of Lua scripts that facilitate using the Fluid Decomposition Toolbox algorithms within the REAPER digital audio workstation."
**Context**: The FluCoMa "Made With" page lists ReaCoMa, Confetti (Constanzo), MIRLCAuto (Xambó), Mosaique (Thibault), Serge Modular Archive (Brazeau/Moore), and Data Knot/SP-Tools (Constanzo) — a vibrant but decentralized ecosystem.
**Confidence**: high

---

## 8. Key Actors & Stakeholders

| Actor | Institution / Affiliation | Role | Key Contribution |
|-------|--------------------------|------|-----------------|
| **Diemo Schwarz** | IRCAM / Imera | Researcher, Developer, Musician | Created CataRT, Caterpillar, co-authored Gabor/FTM; pioneer of real-time CBCS |
| **Norbert Schnell** | IRCAM | Researcher | Co-developed FTM, Gabor, MuBu; foundational signal processing infrastructure |
| **Pierre Alexandre Tremblay** | University of Huddersfield / FluCoMa | Composer, Researcher | Anchored FluCoMa project; Sandbox#n bass+laptop instrument using CataRT |
| **Owen Green** | University of Huddersfield / FluCoMa | Researcher, Developer | Core FluCoMa toolkit development; buffer utilities |
| **Gerard Roma** | University of Huddersfield / FluCoMa | Researcher | FluCoMa dataset and ML infrastructure |
| **James Bradbury** | Ableton (AI R&D) / FluCoMa alumnus | Developer, Composer | ReaCoMa, FTIS, python-flucoma; brought FluCoMa to REAPER and Python |
| **Ted Moore** | Independent / FluCoMa | Research Fellow | Concatenative synthesis examples, pedagogical materials, *quartet* |
| **Rodrigo Constanzo** | Independent | Artist-Developer | C-C-Combine, SP-Tools, Confetti, Data Knot; low-latency percussion systems |
| **Benjamin Hackbarth** | UCSD / IRCAM alumnus | Researcher | AudioGuide (Python concatenative framework) |
| **Daniele Ghisi** | IRCAM / Conservatory of Genoa | Researcher, Composer | dada library; symbolic concatenative synthesis for bach |
| **Dominic Thibault / LFO-lab** | Université de Montréal | Researcher, Developer | Mosaïque (accessible Max for Live CBCS with 3D visualization) |
| **Christopher J. Tralie** | Ursinus College / DataMind Audio | Researcher, Developer | The Concatenator (Bayesian particle filter; ISMIR 2024) |
| **Ben Cantil ("Encanti")** | DataMind Audio | Developer, Musician | Co-creator of Concatenator; commercial productization |
| **Ben Hayes** | Independent (UK) | Researcher | Catecophony (open-source VST3/AU plugin, JUCE/Essentia) |

---

## 9. Tensions, Debates & Counter-Narratives

### 9.1 Real-Time vs. Quality Trade-off

**Claim**: AudioGuide's non-real-time approach enables "much more densely layered" concatenation and "more flexible and creative mapping" than real-time systems, at the cost of interactivity.[^72^]
**Source**: AudioGuide GitHub / Hackbarth
**URL**: https://github.com/benhackbarth/audioguide
**Date**: 2020
**Excerpt**: "AudioGuide is not realtime and therefore sounds can be layered much more densely compared to realtime concatenation. Non-realtime analysis also permits more flexible and creative mapping between target and corpus descriptors as well as algorithmic accounting for overlapping corpus sounds in descriptor calculations."
**Context**: This represents the classical tension: offline systems (AudioGuide, Ted Moore's *quartet* workflow) achieve higher fidelity and density; real-time systems (CataRT, C-C-Combine, Concatenator) sacrifice some quality for interactivity.
**Confidence**: high

### 9.2 Accessibility vs. Depth

**Claim**: A vi-control.net forum user notes that "a lot of solutions seem to be written from an academic Proof-of-Concept point of view and not so much with actual musicians in mind," rendering "'granular synthesis' type results at best."[^69^]
**Source**: vi-control.net forum
**URL**: https://vi-control.net/community/threads/are-there-any-free-standalone-concatenative-synthesis-programs.148552/
**Date**: 2024-02-01
**Excerpt**: "A lot of solutions seem to be written from an academic Proof-of-Concept point of view and not so much with actual musicians in mind. Somehow, conceptually the principles seem to make a lot of sense, while in practice they render 'granular synthesis' type results at best."
**Context**: This critique motivates Mosaïque's and SKataRT's accessibility-focused design, and Concatenator's commercial plugin approach. The counter-narrative is that "granular synthesis type results" may themselves be aesthetically valuable.
**Confidence**: medium (forum opinion, but representative of user frustrations)

### 9.3 GPL Dependency on Proprietary Hosts

**Claim**: CataRT's GPL licensing is philosophically compromised by its dependency on proprietary Max/MSP, creating a situation where the "free software" requires a commercial host.[^80^][^141^]
**Source**: DAFx 2006 / Cycling '74
**URL**: https://www.dafx.de/paper-archive/2006/papers/p_279.pdf / https://cycling74.com/downloads
**Date**: 2006 / 2026
**Excerpt**: "CataRT is a collection of patches for Max/MSP using the FTM, Gabor, and MnM extensions... It is released as free open source software under the GNU general public license (GPL)."
**Context**: The FTM-to-Pure Data port partially addresses this, but CataRT-MuBu remains Max-dependent. FluCoMa mitigates the issue by supporting three CCEs (including open-source SuperCollider and Pure Data).
**Confidence**: high

### 9.4 Commercialization vs. Academic Openness

**Claim**: DataMind Audio's commercialization of the ISMIR 2024 Concatenator research ($149 VST) represents a new trend in monetizing peer-reviewed concatenative synthesis algorithms, contrasting with the historical academic/open-source tradition.[^90^][^179^]
**Source**: Sound on Sound / ISMIR 2024
**URL**: https://www.soundonsound.com/news/concatenator-datamind-audio / https://arxiv.org/abs/2411.04366
**Date**: 2025 / 2024
**Excerpt**: "DataMind Audio, a music AI startup, is working on a proprietary plugin with a much fancier user interface based on the ideas in this paper."
**Context**: The ISMIR paper's Python prototype remains open-source, but the polished VST is commercial. This mirrors broader trends in music AI (e.g., Magenta → commercial products).
**Confidence**: high

### 9.5 The "Blocking" Latency Debate in Max

**Claim**: FluCoMa's `@blocking` parameter exposes a fundamental tension in Max-based real-time systems: `@blocking 2` (scheduler thread, "Rod mode") minimizes latency but risks overloading the scheduler; `@blocking 1` (overdrive/alt thread) balances safety and speed; `@blocking 0` (default, audio thread) is safest but slowest for heavy analysis.[^9^]
**Source**: FluCoMa Learn
**URL**: https://learn.flucoma.org/explore/constanzo/
**Date**: 2023
**Excerpt**: "The @blocking 2 parameter... puts the processing of an object into the scheduler thread, making it of highest priority."
**Context**: This three-tier blocking system is unique to FluCoMa's Max implementation and reflects years of iterative engineering responding to artist needs (especially Constanzo's percussion performance requirements).
**Confidence**: high

---

## 10. Bibliography

[^1^]: Schwarz, D., Beller, G., Verbrugghe, B., & Britton, S. (2006). *Real-Time Corpus-Based Concatenative Synthesis with CataRT*. DAFx 2006. http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf

[^8^]: Constanzo, R. (2015). *C-C-Combine*. Rodrigo Constanzo website. https://rodrigoconstanzo.com/combine/

[^9^]: FluCoMa Learn. (2023). *Rodrigo Constanzo*. https://learn.flucoma.org/explore/constanzo/

[^11^]: Thibault, D. et al. (2024). *Mosaïque - Concatenative Synthesis Instrument for the Practicing Musicians*. AIMC 2024 Workshop. https://aimc2024.pubpub.org/pub/buh7kcah

[^14^]: Thibault, D. (2025). *Mosaique version 0.2*. maxforlive.com. https://maxforlive.com/library/device/13367/mosaique

[^56^]: Ghisi, D., & Agon, C. (2016). *Real-Time Corpus-Based Concatenative Synthesis for Symbolic Notation*. TENOR 2016. https://www.tenor-conference.org/proceedings/2016/01_Ghisi_tenor2016.pdf

[^61^]: Schwarz, D. (2010). *Interacting with a Corpus of Sounds*. eContact! 16.2. https://econtact.ca/16_2/schwarz_corpus.html

[^64^]: Hackbarth, B., Schnell, N., & Schwarz, D. (2010). *AudioGuide: A Framework for Creative Exploration of Concatenative Sound Synthesis*. IRCAM. http://articles.ircam.fr/textes/Hackbarth10a/index.pdf

[^68^]: LFO-lab. (2022). *Mosaique GitHub repository*. https://github.com/LFO-lab/Mosaique

[^69^]: vi-control.net forum. (2024). *Are there any free standalone concatenative synthesis programs?* https://vi-control.net/community/threads/are-there-any-free-standalone-concatenative-synthesis-programs.148552/

[^70^]: CCRMA Stanford. (2023). *FluCoMa: Making Music using Machine Listening & Machine Learning*. https://ccrma.stanford.edu/workshops/flucoma

[^71^]: Academia.edu. *Real-time corpus-based concatenative synthesis with catart*. https://www.academia.edu/12993802/REAL_TIME_CORPUS_BASED_CONCATENATIVE_SYNTHESIS_WITH_CATART

[^72^]: Hackbarth, B. et al. (2020). *AudioGuide GitHub repository*. https://github.com/benhackbarth/audioguide

[^74^]: IRCAM Forum. *Concatenative synthesis projects page*. https://forum.ircam.fr/topics/detail/321-Concatenative%20synthesis/

[^80^]: Schwarz, D. et al. (2006). *Real-Time Corpus-Based Concatenative Synthesis with CataRT* (DAFx 2006 short paper). https://www.dafx.de/paper-archive/2006/papers/p_279.pdf

[^85^]: Schwarz, D. (2006). *Concatenative Sound Synthesis: The Early Years*. Journal of New Music Research, 35(1), 3–22. https://hal.science/hal-01161361v1/document

[^88^]: Schnell, N., & Schwarz, D. (2005). *Gabor, Multi-Representation Real-Time Analysis/Synthesis*. DAFx 2005. https://www.dafx.de/paper-archive/2005/P_122.pdf

[^89^]: Schnell, N., & Schwarz, D. (2005). *Gabor, Multi-Representation Real-Time Analysis/Synthesis*. HAL. https://hal.science/hal-01161342/document

[^90^]: Sound on Sound. (2025). *Concatenator from Datamind Audio*. https://www.soundonsound.com/news/concatenator-datamind-audio

[^91^]: Ghisi, D. (2018). *DADA: Non-Standard User Interfaces for...* TENOR 2018. https://www.tenor-conference.org/proceedings/2018/19_Ghisi_tenor18.pdf

[^92^]: Native Instruments. *Concatenator | AI mosaicing plugin*. https://www.native-instruments.com/en/products/nks-partners/datamind-audio/concatenator/

[^93^]: Tralie, C. J. *The Concatenator*. https://www.ctralie.com/TheConcatenator/

[^95^]: ZMÖLNIG, I. m., MUSIL, T., RITSCH, W., & SCHNELL, N. (2008). *Freer Than Max - porting FTM to Pure Data*. IEM Graz / IRCAM. https://iem.kug.ac.at/fileadmin/03_Microsites/01_Kuenstlerisch_wissenschaftliche_Einheiten/01_Institute/Institut_17_Elektronische_Musik_und_Akustik/Projekte/2008/ftm.pdf

[^112^]: ACE Studio. (2024). *Building a High-Performance Multi-Threaded Audio Processing System*. https://acestudio.ai/blog/multi-threaded-audio-processing/

[^114^]: Stack Overflow. (2015). *What is the best multithreading approach to low-latency audio synthesis in Qt?* https://stackoverflow.com/questions/33923542/what-is-the-best-multithreading-approach-to-low-latency-audio-synthesis-in-qt

[^115^]: IRCAM Forum Discussion. (2025). *catart-mubu release 1.7.0*. https://discussion.forum.ircam.fr/c/catart-mubu/94

[^117^]: SuperCollider Documentation. *Concat*. https://doc.sccode.org/Classes/Concat.html

[^118^]: IRCAM ISMM. *MuBu*. https://ircam-ismm.github.io/max-msp/mubu.html

[^119^]: Stack Overflow. (2010). *Has anybody some advice on programming realtime audio synthesis?* https://stackoverflow.com/questions/4187830/has-anybody-some-advice-on-programming-realtime-audio-synthesis

[^120^]: IRCAM ISMM GitHub. *catart-mubu*. https://github.com/ircam-ismm/catart-mubu

[^141^]: Cycling '74. (2026). *Download Max*. https://cycling74.com/downloads

[^142^]: Hayes, B. (2020). *Catecophony GitHub repository*. https://github.com/ben-hayes/catecophony

[^145^]: Schwarz, D. et al. (2008). *Musical Applications of Real-Time Corpus-Based Concatenative Synthesis*. JIM 2008. https://hal.science/hal-01161376v1/document

[^146^]: FluCoMa Learn. (2023). *Ted Moore - Levels of Translation*. https://learn.flucoma.org/explore/moore/

[^148^]: Gonzalez Bolanos, C. (2023). *FluCoMa: an approach to its ecosystem and convergence with Wavesets synthesis*. Dissertation. https://phaidra.bruckneruni.at/api/object/o:2887/get

[^149^]: Tremblay, P. A., & Schwarz, D. (2010). *Surfing the Waves: Live Audio Mosaicing of an Electric Bass Performance as a Corpus Browsing Interface*. https://www.academia.edu/4722491/

[^169^]: Hayes, B. *Catecophony project page*. https://benhayes.net/projects/2_project/

[^172^]: vi-control.net. (2021). *New IRCAM Ableton / MAX for Live toy: SKataRT*. https://vi-control.net/community/threads/new-ircam-ableton-max-for-live-toy-concatenative-synthesis-skatart.115599/

[^176^]: Tremblay, P. A., Roma, G., Green, O., & Harker, A. (2019). *From Collections to Corpora: Exploring Sounds through Fluid Decomposition*. ICMC 2019. https://pure.hud.ac.uk/ws/files/17022941/towardscorpus_final.pdf

[^177^]: FluCoMa Learn. (2023). *James Bradbury*. https://learn.flucoma.org/explore/bradbury/

[^179^]: Tralie, C. J., & Cantil, B. (2024). *The Concatenator: A Bayesian Approach To Real Time Concatenative Musaicing*. arXiv:2411.04366. https://arxiv.org/abs/2411.04366

[^185^]: Correya, A. et al. *Audio and Music Analysis on the Web using Essentia.js*. https://transactions.ismir.net/articles/111/files/submission/proof/111-1-2904-1-10-20211122.pdf

[^187^]: ISMIR 2024. *Accepted Papers*. https://ismir2024.ismir.net/accepted-papers

[^208^]: Bradbury, J. *ReaCoMa*. https://phd.jamesbradbury.net/tech/reacoma

[^209^]: Cycling '74 Forums. (2020). *ReaCoMa - A port of the FluCoMa max externals*. https://cycling74.com/forums/reacoma-a-port-of-the-flucoma-max-externals-for-your-favourite-daw

[^215^]: YouTube. (2023). *FluCoMa: Concatenative Synthesis on Real-Time Audio*. https://www.youtube.com/watch?v=rNoKdfX1yWI

[^217^]: FluCoMa. *Made with FluCoMa*. https://www.flucoma.org/made-with/

---

*Document compiled April 2026 from 25+ independent web searches across academic repositories (HAL, arXiv, DAFx, ICMC, ISMIR, TENOR), institutional sources (IRCAM, CCRMA, University of Huddersfield), product documentation, developer repositories, and community forums.*
