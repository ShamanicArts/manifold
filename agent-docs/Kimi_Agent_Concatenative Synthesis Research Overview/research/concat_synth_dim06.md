# Dimension 06: Granular Synthesis Connections & Divergences — Deep Research Report

*Compiled: April 2026*
*Scope: Relationship between concatenative synthesis and granular synthesis — historical, technical, commercial, and conceptual dimensions*

---

## 1. Executive Summary

Granular synthesis and concatenative synthesis occupy adjacent positions on a continuum of corpus-based audio techniques, yet diverge fundamentally in selection logic, unit size, and market presence. Granular synthesis, originating with Dennis Gabor's 1947 acoustic quanta theory and realized musically by Iannis Xenakis (1959), Curtis Roads (1974), and Barry Truax (1986), operates on grains of ~1-50ms selected by temporal position. Concatenative synthesis, emerging from speech synthesis unit-selection (Hunt & Black 1996) and adapted to music by Diemo Schwarz (Caterpillar/CataRT, 2000s) and Zils & Pachet (Musical Mosaicing, 2001), operates on units of 100ms to several seconds selected by content-based descriptors. As Diemo Schwarz observed, "Granular synthesis is rudimentarily corpus-based" — it lacks analysis, uses arbitrary unit sizes, and limits selection to position within a single file[^3^]. CataRT explicitly extends granular synthesis with content-based selection, creating a bridge between the two traditions. In the commercial plugin market (2024-2026), granular synthesis dominates overwhelmingly — with tools like Output Portal, Arturia Pigments, Omnisphere, Ableton Granulator III, and Mutable Instruments Clouds/Texture — while concatenative synthesis remains largely confined to research environments (IRCAM, ISMIR papers) and a single emerging commercial product: DataMind Audio's Concatenator (ISMIR 2024). Recent neural approaches (Neural Granular Sound Synthesis, Latent Granular Resynthesis using Neural Audio Codecs) are blurring the boundaries by operating on learned latent spaces rather than raw waveform grains.

---

## 2. Historical Evolution: From Acoustic Quanta to Real-Time Corpus Navigation

### 2.1 Origins: Gabor, Xenakis, and the Analog Era (1947-1974)

Claim: Dennis Gabor introduced the concept of acoustic "grains" or "quanta" in 1947 as part of his Theory of Communication, proposing that sounds could be represented by chaining together very short pulses containing both temporal and frequency information[^433^]
Source: Wikipedia — Granular Synthesis
URL: https://en.wikipedia.org/wiki/Granular_synthesis
Date: 2003 (article); Gabor original 1947
Excerpt: "In 1947, Dennis Gabor introduced the idea that sounds can be represented by a series of elementary 'grains,' each grain being a short pulse containing both temporal and frequency information."
Context: Gabor's theory was originally developed for telecommunications bandwidth reduction, not music.
Confidence: high

Claim: Iannis Xenakis was the first composer to realize granular techniques in a musical composition with Analogique A-B (1959), using analog tone generators and manual tape splicing — Bernard Parmegiani was the musical assistant charged with splicing thousands of grains[^278^]
Source: Curtis Roads, Architecture for Real-Time Granular Synthesis (CMJ)
URL: https://www.curtisroads.net/s/7-RoadsKilgoreDuPlessis-CMJ-copy.pdf
Date: Unknown (paper); Xenakis work 1959
Excerpt: "Xenakis first demonstrated granular synthesis in his 1959 composition Analogique A-B... This was realized by recording sine tones on analog tape, cutting the tapes into thousands of tiny pieces, and then recombining them by manual splicing according to a stochastically generated score. The composer Bernard Parmegiani was the musical assistant charged with the task of splicing thousands of grains to construct this piece."
Context: Historical origin of granular composition.
Confidence: high

Claim: Xenakis defined granular synthesis as "synthese du son a base de quanta sonores" (sound synthesis based on sonic quanta), stating "All sound is an integration of grains, of elementary sonic particles, of sonic quanta"[^425^]
Source: Iannis Xenakis Organization / Agostino Di Scipio
URL: https://www.iannis-xenakis.org/en/granular-synthesis/
Date: 2023 (article); Xenakis original 1963
Excerpt: "He wrote: 'All sound is an integration of grains, of elementary sonic particles, of sonic quanta' and therefore any sound can be analytically modelled and electronically generated as 'an assemblage of a large number of elementary grains adequately disposed in time'."
Context: Xenakis developed the theoretical framework that would later be named "granular synthesis" by Roads in 1978.
Confidence: high

Claim: The technical resources of the late 1950s made Xenakis's Analogique B "overwhelmingly complicated" and the result "less interesting than the composer expected," leading Xenakis to never return to granular synthesis even when better technologies became available[^425^]
Source: Iannis Xenakis Organization / Agostino Di Scipio
URL: https://www.iannis-xenakis.org/en/granular-synthesis/
Date: 2023 (article)
Excerpt: "With the technical resources of the late 1950s, the making of Analogique B proved overwhelmingly complicated... bringing the job to completion must have proved difficult and frustrating, and the end result anyway sounded less interesting than the composer expected. Confronting such circumstances, Xenakis even considered resorting to computational means... But time was not ripe."
Context: Shows the practical barriers that prevented granular synthesis from flourishing until the digital era.
Confidence: high

### 2.2 The Digital Revolution: Curtis Roads and Microsound (1974-2001)

Claim: Curtis Roads was the first to implement granular synthesis on a digital computer in 1974 at UC San Diego, using Max Mathews's Music V language on a mainframe; his first experiment "Klang-1" required typing each grain specification onto a separate punched card — about 800 cards for 30 seconds of sound[^277^]
Source: Curtis Roads, Microsound (MIT Press)
URL: https://monoskop.org/images/d/d1/Roads_Curtis_Microsound.pdf
Date: 2001 (book); Roads work 1974
Excerpt: "After realizing a number of short etudes with Music V, in December 1974 I tested the first implementation of asynchronous granular synthesis. For this experiment, called Klang-1, I typed each grain specification (frequency, amplitude, duration) onto a separate punched card. A stack of about eight hundred punched cards corresponded to the instrument and score for thirty seconds of granular sound."
Context: From Roads' seminal book Microsound, documenting the early computational implementation.
Confidence: high

Claim: In 1981 at MIT, Roads conducted the first experiments with granular sampling (granulation of sampled sound files), spatializing grains to a quadraphonic sound system — the start position in the sound file was unique to each grain[^278^]
Source: Curtis Roads et al., Architecture for Real-Time Granular Synthesis
URL: https://www.curtisroads.net/s/7-RoadsKilgoreDuPlessis-CMJ-copy.pdf
Date: Unknown (paper)
Excerpt: "At the Massachusetts Institute of Technology in 1981, Roads conducted the first experiments with granular sampling, spatializing the grains to a quadraphonic sound system. In this implementation, the point in the sound file at which to start reading the extracted sample was unique to each grain, as well as its amplitude and spatial position."
Context: Granular sampling is the direct precursor to both modern granular plugins and concatenative synthesis.
Confidence: high

Claim: Roads developed the Cloud Generator program with John Alexander in 1995, which merged code from previous programs (Synthulate, Granulate) into a single interactive application that has served as a teaching aid and been used in compositions worldwide[^277^]
Source: Curtis Roads, Microsound (MIT Press)
URL: https://monoskop.org/images/d/d1/Roads_Curtis_Microsound.pdf
Date: 2001 (book)
Excerpt: "Working at Les Ateliers UPIC in 1995, John Alexander and I developed the Cloud Generator program... Our implementation of Cloud Generator merged the C code from several of my previous programs (Synthulate, Granulate, etc.) into a single interactive application. Since then, Cloud Generator has served as a teaching aid in the basics of granular synthesis."
Context: Cloud Generator is still available from Roads' website and represents a foundational pedagogical tool.
Confidence: high

Claim: Roads' 2001 book Microsound (MIT Press) remains the definitive theoretical and historical survey, covering nine time scales of musical sound structure, tracing the history from ancient atomism through the Gabor matrix, and cataloging particle synthesis techniques including glissons, grainlets, pulsars, trainlets, sonographic particles, and frequency-domain granulation[^377^]
Source: Curtis Roads, Microsound (MIT Press)
URL: https://monoskop.org/images/d/d1/Roads_Curtis_Microsound.pdf
Date: 2001
Excerpt: "Chapter 3 presents the theory and practice of digital granular synthesis in its myriad manifestations. It examines the different methods for organizing the grains, and looks at the effects produced in each parameter of the technique. It then surveys the various implementations of computer-based granular synthesis, beginning with the earliest experiments in the 1970s. Chapter 5 surveys a broad variety of microscopic sound transformations... including pitch-shifting, pitch-time changing, filtering, dynamics processing, frequency-domain granulation, and waveset transformations."
Context: Microsound is the canonical reference for the entire field.
Confidence: high

### 2.3 Real-Time Breakthrough: Barry Truax and the GSX (1986)

Claim: Barry Truax built the first system capable of real-time granular synthesis in 1986, implemented on the DMX-1000 Signal Processing Computer; his composition Riverrun (1986) was the first realized entirely with real-time granular synthesis[^280^]
Source: Adventures in Synthesis: Emulating the GSX
URL: https://ijc8.me/2020/09/06/emulating-the-gsx/
Date: 2020-09-06
Excerpt: "In 1986, Barry Truax built the first system that could perform granular synthesis in real-time, allowing the composer to modify the synthesis parameters while listening to the result."
Context: Truax's real-time implementation was the watershed moment that transformed granular synthesis from an offline computational curiosity into a performable instrument.
Confidence: high

Claim: Truax described the moment of discovery: "Curtis Roads had done it in non-real time, heroically, hundreds of hours of calculation time on mainframes, just to get a few seconds of sound... As soon as I started working with it in real time and heard the sound, it was rich, it was appealing to the ear, immediately, even with just sine waves as the grains. Suddenly they came alive."[^282^]
Source: Josh Stovall, Granular Synthesis: An Overview
URL: https://joshstovall.com/writing/granular-synthesis/
Date: 2018-12-21
Excerpt: "Curtis Roads had done it in non-real time, heroically, hundreds of hours of calculation time on mainframes, just to get a few seconds of sound. He had done that, but it remained a textbook case. As soon as I started working with it in real time and heard the sound, it was rich, it was appealing to the ear, immediately, even with just sine waves as the grains. Suddenly they came alive."
Context: Truax's quote captures the paradigm shift from deferred-time to real-time granular synthesis.
Confidence: high

### 2.4 The GRM Tradition and Early Software Tools

Claim: The GRM (Groupe de Recherches Musicales) in Paris, founded by Pierre Schaeffer and later led at INA, developed tools like Freeze and Shuffling that are "arguably the grandparents of all today's 'granular' effects" — Freeze uses a 30-second buffer with looped, layered, pitch-shifted windows; Shuffling samples fragments semi-randomly from a 3-second buffer[^454^]
Source: Sound on Sound, INA GRM Tools 3 review
URL: https://www.soundonsound.com/reviews/ina-grm-tools-3
Date: 2013-10-14
Excerpt: "Freeze and Shuffling are arguably the grandparents of all today's 'granular' effects, and although they're quite simple compared with newer plug-ins from other manufacturers, they're nonetheless both fun and effective. Freeze is based around a 30-second buffer that samples the audio input. You can then specify the start and end points of a 'window' within this buffer, which is looped, layered and pitch-shifted in a variety of ways while the 'window' is dragged around in real time. Shuffling also employs an input buffer, this time only three seconds in length, from which fragments are sampled in a semi-random fashion according to various parameters."
Context: GRM Tools represents the institutional/academic lineage of granular processing, distinct from the commercial plugin market.
Confidence: high

Claim: GRM Tools has a long pedigree — launched 16+ years ago as a TDM plug-in suite for Pro Tools, with a native VST version emerging five years later; by version 3 it included 15 plugins organized into Classic, Spectral Transform, and Evolution bundles[^454^]
Source: Sound on Sound, INA GRM Tools 3 review
URL: https://www.soundonsound.com/reviews/ina-grm-tools-3
Date: 2013-10-14
Excerpt: "Developed by the Group de Recherches Musicales in France, GRM Tools has a long pedigree. It was launched some 16 years ago as a TDM plug-in suite for Pro Tools, with a native VST version emerging five years later."
Context: GRM Tools is an early example of academic research transitioning to commercial software.
Confidence: high

---

## 3. Core Differences: Granular vs. Concatenative Synthesis

### 3.1 The Fundamental Distinction

Claim: The key difference is that granular synthesis uses tiny grains (1-50ms) for texture manipulation, while concatenative synthesis uses longer audio segments (100ms to several seconds) selected based on acoustic analysis; concatenative synthesis prioritizes natural voice/sound preservation[^10^]
Source: Vapi.ai — How to Create Natural Audio Using Concatenative Synthesis
URL: https://vapi.ai/blog/concatenative-synthesis
Date: 2025-05-30
Excerpt: "The key difference? While granular synthesis uses tiny grains for textures and traditional unit-selection TTS focuses purely on phonetic accuracy, concatenative synthesis works with longer, meaningful segments (100ms to several seconds). This creates space for both natural sound quality and creative flexibility."
Context: Commercial voice AI perspective on the distinction.
Confidence: medium

Claim: "In contrast to granular synthesis, concatenative synthesis is driven by an analysis of the source sound, in order to identify the units that best match the specified criterion"[^285^]
Source: Wikipedia — Concatenative Synthesis
URL: https://en.wikipedia.org/wiki/Concatenative_synthesis
Date: 2010-01-15
Excerpt: "In contrast to granular synthesis, concatenative synthesis is driven by an analysis of the source sound, in order to identify the units that best match the specified criterion."
Context: This is the canonical Wikipedia definition of the distinction.
Confidence: high

### 3.2 Schwarz's Foundational Analysis: Granular as "Rudimentarily Corpus-Based"

Claim: Diemo Schwarz stated: "Granular synthesis is rudimentarily corpus-based, considering that there is no analysis, the unit size is determined arbitrarily, and the selection is limited to choosing the position in one single sound file. However, its concept of exploring a sound interactively, when combined with a pre-analysis of the data and thus enriched by a targeted selection, results in a precise control over the output sound characteristics, as realised in CATART."[^3^]
Source: Schwarz et al., Principles and Applications of Interactive Corpus-Based Concatenative Synthesis (JIM 2008)
URL: http://jim.afim-asso.org/jim08/upload/05_Schwarz_catart-jim2008-final.pdf
Date: 2008
Excerpt: "One source of inspiration of the present work is granular synthesis[22], which takes short snippets(grains) out of a sound file, at an arbitrary rate. These grains are played back with a possibly changed pitch, envelope, and volume. The position and length of the snippets are controlled interactively, allowing to scan through the soundfile, in any speed. Granular synthesis is rudimentarily corpus-based, considering that there is no analysis, the unit size is determined arbitrarily, and the selection is limited to choosing the position in one single sound file. However, its concept of exploring a sound interactively, when combined with a pre-analysis of the data and thus enriched by a targeted selection, results in a precise control over the output sound characteristics, as realised in CATART."
Context: This is perhaps the single most important statement defining the relationship between the two techniques. Schwarz acknowledges granular as a precursor but emphasizes the transformative addition of analysis and descriptor-based selection.
Confidence: high

### 3.3 Unit Sizes: The Scale Divide

Claim: In granular synthesis, grains are typically 1-50ms long (some sources extend to 1-100ms), while concatenative synthesis units range from 100ms to several seconds; when grains become longer and their temporal interval reaches tenths of a second, "the boundaries between 'synthesis' and 'sampling' become blurred"[^393^][^348^]
Source: Produce Like A Pro / Understanding Granular Synthesis; Daniele Ghisi PhD thesis
URL: https://producelikeapro.com/blog/understanding-granular-synthesis/; https://www.danieleghisi.com/phd/PHDThesis_20180118.pdf
Date: 2021; 2018
Excerpt (PLAP): "Microsounds are those which are longer than musical notes and shorter than samples—each piece is somewhere between 1 and 50 ms long."
Excerpt (Ghisi): "No size limit is imposed to each grain, nor on the distance between grains: when grains are longer and when their temporal interval is in the order of the tenths of a second or above, the pitch of the original sound is preserved, and the boundaries between 'synthesis' and 'sampling' become blurred."
Context: The unit size difference is the most concrete technical distinction between the two approaches.
Confidence: high

### 3.4 Position-Based vs. Descriptor-Based Selection

Claim: Granular synthesis controls "the position and length of the snippets" interactively, allowing the user to scan through a sound file at any speed; CataRT extends this by using a multi-dimensional descriptor space where "the user controls a target point in a lower-dimensional projection of that space with a selection radius around it, and the selection algorithm selects the units closest to the target or within the radius"[^3^][^80^]
Source: Schwarz, JIM 2008; Schwarz et al., DAFx 2006
URL: http://jim.afim-asso.org/jim08/upload/05_Schwarz_catart-jim2008-final.pdf; https://www.dafx.de/paper-archive/2006/papers/p_279.pdf
Date: 2008; 2006
Excerpt (JIM 2008): "CATART's model is a multi-dimensional space of descriptors, populated by the sound units. The user controls a target point in a lower-dimensional projection of that space with a selection radius around it, and the selection algorithm selects the units closest to the target or within the radius."
Excerpt (DAFx 2006): "The concatenative real-time sound synthesis system CataRT plays grains from a large corpus of segmented and descriptor-analysed sounds according to proximity to a target position in the descriptor space. This can be seen as a content-based extension to granular synthesis providing direct access to specific sound characteristics."
Context: The descriptor-space navigation is what makes concatenative synthesis musically powerful but also computationally demanding.
Confidence: high

---

## 4. The Bridge: CataRT and Corpus-Based Concatenative Synthesis

### 4.1 CataRT as Granular Synthesis Extended

Claim: CataRT's "principal application" is "interactive explorative synthesis from a sound corpus, based on musically meaningful descriptors" — "Here, granular synthesis is extended by a targeted selection according to the content of the sound base. One could see this as abolishing the temporal dimension of a sound file, and navigating through it based on content alone"[^80^]
Source: Schwarz et al., Real-Time Corpus-Based Concatenative Synthesis with CataRT (DAFx 2006)
URL: https://www.dafx.de/paper-archive/2006/papers/p_279.pdf
Date: 2006
Excerpt: "The principal application of CataRT is the interactive explorative synthesis from a sound corpus, based on musically meaningful descriptors. Here, granular synthesis is extended by a targeted selection according to the content of the sound base. One could see this as abolishing the temporal dimension of a sound file, and navigating through it based on content alone."
Context: CataRT is the canonical bridge between granular and concatenative traditions.
Confidence: high

Claim: CataRT's synthesis engine is "based on the Gabor library's frame-based processing framework" and applies "a choosable short fade-in and fade-out" with manipulations "similar to a granular synthesis engine"; the copied length can be "arbitrarily changed (de facto falsifying the selection criteria) to achieve granular-style effects or clouds of overlapping grains"[^80^]
Source: Schwarz et al., DAFx 2006
URL: https://www.dafx.de/paper-archive/2006/papers/p_279.pdf
Date: 2006
Excerpt: "CataRT's synthesis applies a choosable short fade-in and fade-out to the sound data of a selected unit... Other manipulations similar to a granular synthesis engine can be applied: the copied length of the sound data can be arbitrarily changed (de facto falsifying the selection criteria) to achieve granular-style effects or clouds of overlapping grains."
Context: The synthesis engine deliberately retains granular-style capabilities while adding content-based selection.
Confidence: high

Claim: The conclusion of the JIM 2008 paper states: "The concatenative synthesis approach is a natural extension of granular synthesis, augmented by content-based selection and control, but keeping the richness of the source sounds"[^3^]
Source: Schwarz et al., JIM 2008
URL: http://jim.afim-asso.org/jim08/upload/05_Schwarz_catart-jim2008-final.pdf
Date: 2008
Excerpt: "We presented corpus-based concatenative synthesis and its real-time implementation in the CATART system... The concatenative synthesis approach is a natural extension of granular synthesis, augmented by content-based selection and control, but keeping the richness of the source sounds."
Context: This framing is central to understanding the historical relationship.
Confidence: high

### 4.2 Musical Mosaicing and the Constraint-Satisfaction Paradigm

Claim: Zils and Pachet introduced "Musical Mosaicing" (Musaicing) in 2001, formulating unit selection as a constraint satisfaction problem (CSP) — "the set of descriptors used for the selection is: mean pitch (by zero crossing rate), loudness, percussivity, timbre (by spectral distribution)"[^6^]
Source: Schwarz, Concatenative Sound Synthesis (IRCAM thesis/monograph)
URL: http://articles.ircam.fr/textes/Schwarz06b/index.pdf
Date: ~2006
Excerpt: "Musical Mosaicing, or Musaicing (Zils & Pachet, 2001), performs a kind of automated remix of songs. It is aimed at a sound database of pop music, selecting pre-analysed homogeneous snippets of songs and reassembling them. Its great innovation was to formulate unit selection as a constraint solving problem (CSP). The set of descriptors used for the selection is: mean pitch (by zero crossing rate), loudness, percussivity, timbre (by spectral distribution)."
Context: Musaicing represents an alternative approach to concatenative selection using constraints rather than nearest-neighbor search.
Confidence: high

### 4.3 The PhD Thesis Framework: Corpus-Based Concatenative Sound Synthesis

Claim: Daniele Ghisi's 2018 PhD thesis formalizes the lineage: "Corpus-based concatenative synthesis [Schwarz, 2007] directly derives from granular synthesis, and provides mechanisms for sequencing of 'grains' according to their proximity in some descriptor space. It is based on sound analysis, and differs from micromontage in that the descriptor space is formalized and programmatically explorable"[^348^]
Source: Daniele Ghisi, PhD thesis (IRCAM/UPMC)
URL: https://www.danieleghisi.com/phd/PHDThesis_20180118.pdf
Date: 2018-01-19
Excerpt: "Corpus-based concatenative synthesis[Schwarz, 2007] directly derives from granular synthesis, and provides mechanisms for sequencing of 'grains' according to their proximity in some descriptor space. It is based on sound analysis, and differs from micromontage in that the descriptor space is formalized and programmatically explorable."
Context: Academic formalization of the derivation from granular to concatenative.
Confidence: high

---

## 5. Synchronous vs. Asynchronous Granular Synthesis

### 5.1 The Two Modalities

Claim: There are "two distinct ways of using granular synthesis" — synchronous (constant hop size/linear spacing between grains) and asynchronous (random or statistical distribution); synchronous granular synthesis is "very closely related to Formant Synthesis, more commonly known as FOF synthesis"[^292^]
Source: Granular Synthesis Resource Website (hthesis)
URL: https://www.granularsynthesis.com/hthesis/sync.html
Date: Unknown
Excerpt: "There are two distinct ways of using granular synthesis. These methods are quite different from each another and produce different textural effects. They are: Synchronous granular synthesis; Asynchronous granular synthesis. Synchronous granular synthesis is very closely related to Formant Synthesis, more commonly known as FOF synthesis."
Context: Standard taxonomy of granular organization methods.
Confidence: high

Claim: In synchronous granular synthesis, "the frequency produced is the reciprocal of the hop size, which acts as the period of a periodic waveform"; at very low densities it produces rhythmic effects, and once density reaches a certain level "the rhythmic effect will morph into a pitched effect"[^300^]
Source: Josh Stovall, Granular Synthesis: An Overview
URL: https://joshstovall.com/writing/granular-synthesis/
Date: 2018-12-21
Excerpt: "Synchronous granular synthesis implies that the time difference between successive grains, or the hop size — is constant... A very low density will produce a rhythmic effect. Once the density reaches a certain level the rhythmic effect will morph into a pitched effect. The frequency produced is the reciprocal of the hop size, which acts as the period of a periodic waveform."
Context: Synchronous mode produces pitch through periodic grain streams.
Confidence: high

Claim: Asynchronous granular synthesis "produces grain clouds by scattering grains in a statistical manner over a specified duration... It abandons the concept of linear streams of grains and instead, disperses grains within regions on the time-frequency plane"[^300^]
Source: Josh Stovall, Granular Synthesis: An Overview
URL: https://joshstovall.com/writing/granular-synthesis/
Date: 2018-12-21
Excerpt: "Asynchronous granular synthesis produces grain clouds by scattering grains in a statistical manner over a specified duration. It abandons the concept of linear streams of grains and instead, disperses grains within regions on the time-frequency plane."
Context: Asynchronous mode is the more common approach in modern granular plugins for texture creation.
Confidence: high

### 5.2 Density Thresholds and Perceptual Effects

Claim: At various grain densities with typical 25ms grains: <15 grains/second produces rhythmic sequences; 15-25 produces fluttering; 25-50 grain order disappears; 50-100 produces "texture band"; >100 produces continuous sound mass[^300^]
Source: Josh Stovall, citing Roads
URL: https://joshstovall.com/writing/granular-synthesis/
Date: 2018-12-21
Excerpt: "|Grains per second|Perception| |---|---| |< 15|Rhythmic sequences.| |15-25|Fluttering, sensation of rhythm disappears.| |25-50|Grain order disappears... |50-100|Texture band... |> 100|Continuous sound mass. No space between grains."
Context: These thresholds explain why concatenative synthesis (with longer units at lower densities) preserves recognizable morphology while granular synthesis tends toward texture.
Confidence: high

---

## 6. Time-Domain vs. Frequency-Domain Granulation

### 6.1 Time-Domain Granulation

Claim: Time-domain granular synthesis extracts and rearranges actual waveform segments (grains) from the source audio, with each grain having its own envelope; this is the classic approach of Roads, Truax, and most hardware/software granular synthesizers[^393^]
Source: Produce Like A Pro
URL: https://producelikeapro.com/blog/understanding-granular-synthesis/
Date: 2021-07-15
Excerpt: "Granular synthesis is based on the same principles as sampling, but instead of playing back samples regularly, it chops them up into what are referred to as 'grains.' These grains, we mentioned, are anywhere between 1 and 50 ms in length, and can be manipulated by a number of parameters."
Context: The dominant implementation paradigm.
Confidence: high

### 6.2 Frequency-Domain Granulation and the Phase Vocoder

Claim: The phase vocoder is "similar to granular synthesis in that the input is broken into short grains of sound which are reassembled to create an output sound"; the "distinctive aspect of the phase vocoder is that when grains are assembled into the output, the phase of each frequency component is adjusted to avoid phase cancellation"[^448^]
Source: Carnegie Mellon University, Phase Vocoder Tutorial
URL: https://www.cs.cmu.edu/~music/nyquist/extensions/pvoc/phasevocoder.html
Date: Unknown
Excerpt: "The phase vocoder is similar to granular synthesis in that the input is broken into short grains of sound which are reassembled to create an output sound. In the phase vocoder, the output signal is always constructed from equally spaced grains. The distinctive aspect of the phase vocoder is that when grains are assembled into the output, the phase of each frequency component is adjusted to avoid phase cancellation."
Context: The phase vocoder can be understood as a specialized form of frequency-domain granular processing.
Confidence: high

Claim: "Phase vocoder excels with harmonic content like music, granular synthesis handles complex textures effectively, and PSOLA maintains speech intelligibility" — the choice depends on source material and degree of time adjustment needed[^446^]
Source: Sonarworks blog
URL: https://www.sonarworks.com/blog/learn/whats-the-difference-between-time-stretching-and-ai-voice-manipulation
Date: 2025-12-09
Excerpt: "Phase vocoder techniques – Break audio into overlapping frequency bands, stretch or compress the time domain, then reconstruct the signal with minimal artifacts. Granular synthesis methods – Divide audio into small grains, manipulate their timing independently, and blend them back together for seamless playback. Phase vocoder excels with harmonic content like music, granular synthesis handles complex textures effectively."
Context: Practical guidance on algorithm selection.
Confidence: medium

Claim: Roads' Microsound explicitly covers "frequency-domain granulation" in Chapter 5 as part of microscopic sound transformations, alongside pitch-shifting, pitch-time changing, filtering, dynamics processing, and waveset transformations[^377^]
Source: Roads, Microsound
URL: https://monoskop.org/images/d/d1/Roads_Curtis_Microsound.pdf
Date: 2001
Excerpt: "The chapter then covers transformations on a micro scale, including pitch-shifting, pitch-time changing, filtering, dynamics processing, frequency-domain granulation, and waveset transformations."
Context: Frequency-domain approaches have been part of the granular toolkit since the early 2000s.
Confidence: high

Claim: Mutable Instruments Clouds initially started as a "spectral sampler" concept (encoding FFT slices and unrolling them forever) before evolving to focus on granular; the "BOKEH" parameter in teasers randomized FFT phase and low-pass filtered magnitude in each bin[^276^]
Source: Mutable Instruments Documentation — Clouds History
URL: https://pichenettes.github.io/mutable-instruments-documentation/trivia_and_history/clouds_history/
Date: Unknown
Excerpt: "Initial concept: Aeons. Spectral sampler (we sample a FFT slice and unroll it forever) with pitch-shifting and GRM warp weird thing. Sounded great on my computer, but reacted horribly to CV once I got the code running on the hardware - in particular lots of ugly time-quantization because of FFT windowing."
Context: Clouds' development history reveals the proximity of spectral and granular approaches.
Confidence: high

---

## 7. Modern Granular Synthesis Plugins and Hardware (2024–2026)

### 7.1 Market Dominance of Granular over Concatenative

Claim: In the commercial plugin market, granular synthesis is vastly more prevalent than concatenative synthesis; a 2026 roundup of "Best 15 Granular Synthesis VST Plugins" includes Output Portal, Arturia Pigments, Omnisphere, Sugar Bytes Graindad, Arturia Efx Fragments, NI Straylight, and others — with no concatenative synthesis plugins mentioned[^462^]
Source: Artists in DSP
URL: https://artistsindsp.com/the-best-15-granular-synthesis-vst-plugins-in-2026/
Date: 2026-01-10
Excerpt: "|Plugin Name|Price|Complexity|Best For| |Arturia Pigments 5|$199|Medium|All-in-One Synth Powerhouse| |Output Portal|$149|Low|Musical Effects & Inspiration| |Audio Damage Quanta 2|$129|Medium|Deep Sound Design| |Spectrasonics Omnisphere|$499|High|Cinematic Sound & Preset Library| |Sugar Bytes Graindad|$99|Medium|Rhythmic Glitching & Stutter FX|..."
Context: The market completely favors granular; concatenative synthesis has virtually no commercial presence.
Confidence: high

### 7.2 Output Portal

Claim: Output Portal ($149) is a "powerhouse" granular FX plugin with an advanced granular engine, XY macro pad, modulation envelopes, 7 built-in effects, time stretch, grain delay, and 250+ factory presets; grain sizes range from 0.50ms to one second, and density can sync to tempo from 64th note triplets to one bar[^271^][^274^]
Source: FRCTLAUDIO (GRN vs Portal comparison); Whoknowsfrankynelly (Autochroma vs Portal)
URL: https://frctlaudio.com/blog/grn-vs-output-portal; https://whoknowsfrankynelly.com/autochroma_vs_portal/
Date: 2026-01-29; 2024-12-23
Excerpt: "Portal's grain engine offers similar core functionality — density, size, pitch, stretch, delay, and pan — but adds a randomness parameter for several controls. Portal's grain sizes range from 0.50ms to one second, and density can sync to tempo from 64th note triplets to one bar. Portal also includes a time stretch feature and a 'humanize' control that adds natural envelope variation."
Context: Portal is one of the most popular dedicated granular plugins in the market.
Confidence: high

### 7.3 Mutable Instruments Clouds / Texture

Claim: Mutable Instruments Clouds (2014) "brought granular synthesis to the masses" in Eurorack format; it was a "cult classic" module that started as a spectral sampler concept, went through multiple evolution stages (multi-function processor with granular, WSOLA, PSOLA, spectral, delay, pitch-shifter, reverb modes), before being distilled to focus on the granulator with reverbey bits; the open-source firmware "spawned dozens of variants"[^272^][^276^]
Source: Perfect Circuit (Clouds Retrospective); Mutable Instruments Documentation
URL: https://www.perfectcircuit.com/signal/mutable-clouds-retrospective; https://pichenettes.github.io/mutable-instruments-documentation/trivia_and_history/clouds_history/
Date: 2025-06-17; Unknown
Excerpt (Perfect Circuit): "Mutable Instruments Clouds is a cult classic Eurorack module that, in 2014, brought granular synthesis to the masses."
Excerpt (Mutable Docs): "I demoed it to a few people and what they liked most was the granulator, so I killed everything else and focused on that. That's when I realized I could salvage all the reverbey bits because they work so well at turning harsh grain textures into lush atmospheres."
Context: Clouds represents the hardware democratization of granular synthesis; its successor is Texture.
Confidence: high

### 7.4 Arturia Pigments

Claim: Arturia Pigments 5/6 features a "Sample and Granular engine" alongside wavetable, harmonic, virtual analog, and modal engines; the granular mode can turn "a simple electric piano tone into a beautiful texture or a stuttering mess"; Pigments 6 added a Scan function to the granular mode "allowing movement through the grain stream for effects such as time-stretching and dynamic texturing"[^290^][^289^]
Source: Synth and Software; Plugin Plug
URL: https://synthandsoftware.com/2024/04/arturia-pigments-5-0-polychrome-software-synthesizer-the-synth-and-software-review/; https://pluginplug.io/blog/arturia-pigments-6-new-features
Date: 2024-04-16; 2025-02-17
Excerpt: "And then there's the granular engine, with which you can turn a simple electric piano tone into a beautiful texture or a stuttering mess."
Context: Pigments is a flagship all-in-one synth where granular is one of multiple engines.
Confidence: high

### 7.5 Ableton Granulator III (Live 12, 2024)

Claim: Granulator III, bundled with Ableton Live 12 (2024), is the latest iteration of Robert Henke's granular instrument; it adds MPE capability for expressive control over note bend, vibrato, and glissando; real-time audio capture for immediate manipulation; and three playback modes: Classic (overlapping grains), Loop (grains play sequentially without overlapping), and Cloud (cluster of grains for chorused textures)[^341^][^342^]
Source: Sound on Sound; Ableton.com
URL: https://www.soundonsound.com/techniques/ableton-live-12-granulator-iii; https://www.ableton.com/en/live/all-new-features/
Date: 2025-11-01; Unknown
Excerpt (SOS): "Granulator III, the latest version of Robert Henke's granular synthesizer, brings expressive control to the forefront. You can bend notes, add vibrato and glissando, and even capture real-time audio for immediate manipulation."
Excerpt (Ableton): "The latest iteration of Robert Henke's granular instrument now has MPE capability, giving you expressive control over parameters like note bend, vibrato and glissando. Plus, you can now capture audio in real time and start manipulating it immediately."
Context: Granulator III represents the mainstream DAW integration of granular synthesis.
Confidence: high

### 7.6 Robert Henke's Granulator Lineage

Claim: Robert Henke (Monolake) has been developing granular instruments since 1997 when real-time audio processing was added to Max; Granulator II (2013) was based on "quasi-synchronous granular synthesis" creating "a constant stream of short crossfading sections of the source sample"; Granulator III is considered "in many ways superior" but Granulator II remains interesting for its simpler engine, lower CPU usage, and completely open Max patch structure[^316^]
Source: Robert Henke's website
URL: https://roberthenke.com/technology/granulator.html
Date: Unknown
Excerpt: "Granulator II is a Max4Live synthesizer based on the principle of quasi-synchronous granular synthesis. It creates a constant stream of short crossfading sections of the source sample... Granulator II is the second incarnation of a series of granular based synthesizers I wrote for my own usage since the addition of real time audio processing to Max in 1997."
Context: Henke's granular lineage spans nearly 30 years and is deeply intertwined with Ableton Live's development.
Confidence: high

### 7.7 Spectrasonics Omnisphere

Claim: Omnisphere includes a granular synthesis engine as part of its four-layer multitimbral architecture; version 1.5 added "Speed" and "Position" modes with a "Granular Visualizer"; version 2.5 redesigned the Granular page with "a full waveform display and a clearer view of what each of the grains are doing at any moment"; the engine supports up to 8 voices of granularity per layer with LEGACY mode for backwards compatibility[^310^][^311^][^315^]
Source: Spectrasonics announcements; Omnisphere manual
URL: https://www.spectrasonics.net/news/news-content.php?id=52; https://www.spectrasonics.net/news/news-content.php?id=112; https://support.spectrasonics.net/manual/Omnisphere2/25/en/topic/layer-page-oscillator-page29
Date: Unknown
Excerpt: "Omnisphere's Granular synthesis area has been made significantly more powerful by including new 'Speed' and 'Position' modes, which create dramatic polyphonic shifts through the audio and time spectrums."
Context: Omnisphere's granular engine is one of many synthesis modes in a massive preset library instrument.
Confidence: high

### 7.8 iZotope Iris (Discontinued)

Claim: iZotope Iris 2 was a sample-based synthesizer that combined "the power of a sampler, the flexibility of a modular synth, and the fun of spectral filtering"; it allowed users to "paint in the audio files and play only certain spectra of a file" — looking like granular synthesis but actually using a special form of resynthesis; it was discontinued in October 2022 along with BreakTweaker and Trash 2[^280^][^279^]
Source: MusicTech; Synth Anatomy
URL: https://musictech.com/news/gear/izotope-discontinues-iris2-breaktweaker-trash-2-plugins/; https://synthanatomy.com/2022/10/izotope-discontinues-iris-2-breaktweaker-and-trash-2-plugins.html
Date: 2022-10-27; 2022-10-26
Excerpt (Synth Anatomy): "Iris 2 is a unique sample Synthesizer that combines sample playback with ideas of additive synthesis and resynthesis. It offers fours layers in which you can load an audio file... Iris 2 had the ability to mangle audio files in a novel way. You could paint in the audio files and play only certain spectra of a file. It looked like granular synthesis, but it was a special form of resynthesis."
Context: Iris represented a spectral/resynthesis approach adjacent to granular; its discontinuation shows market consolidation.
Confidence: high

### 7.9 Kontakt / Native Instruments Granular Instruments

Claim: Native Instruments has developed multiple granular instruments for Kontakt including Straylight, Pharlight, and Ashlight — forming a "granular instrument trilogy" for Kontakt 6; Straylight features a "dual-layer granular engine" with Grain and Sample engines, 360+ sounds, and 380+ presets; Ashlight explores "the dark and colder side of granular synthesis"[^299^][^297^]
Source: Morning Dew Media; Synth Anatomy
URL: https://www.morningdewmedia.com/straylight-review-kontakt-library-showcase/; https://synthanatomy.com/2021/08/native-instruments-ashlight-kontakt-granular-instrument-explores-the-dark-side.html
Date: 2019-06-25; 2021-08-12
Excerpt: "Straylight is a brand new granular library for the Kontakt sampler... The granular vst plugin Straylight sound engine features two distinct separate sound engines. One called Grain, and a second called Sample."
Context: NI's approach embeds granular within the established Kontakt sampling ecosystem.
Confidence: high

---

## 8. The Other Side: Concatenative Synthesis Tools and Research

### 8.1 Caterpillar and CataRT (IRCAM)

Claim: Diemo Schwarz's Caterpillar system (2000-2004, PhD thesis) adapted speech synthesis unit-selection (Viterbi path-search with target cost and concatenation cost) to musical sound synthesis; CataRT (2006-present) made this real-time and interactive within Max/MSP; CataRT is "released as free open source software under the GNU general public license (GPL)"[^80^][^59^]
Source: Schwarz, DAFx 2006; HAL current research
URL: https://www.dafx.de/paper-archive/2006/papers/p_279.pdf; https://hal.science/hal-01161337v1/document
Date: 2006; 2015
Excerpt: "CataRT is based on the previous developments Caterpillar for non real-time data-driven concatenative musical sound synthesis... CataRT is implemented as a collection of patches for Max/MSP using the FTM library and an SQL database."
Context: IRCAM remains the institutional center of concatenative synthesis research.
Confidence: high

### 8.2 SKataRT (IRCAM/Ableton Integration)

Claim: IRCAM released SKataRT in 2021 as a "Max for Live device / instrument which brings together synthesis techniques from CataRT and synthesis techniques by mosaicing"; it features automatic segmentation by time/onset/silence, automatic analysis of 4 audio characteristics, synthesis control by X/Y position in timbre space or live input analysis, and up to 16 output channels[^172^]
Source: VI-Control forum / IRCAM Forum
URL: https://vi-control.net/community/threads/new-ircam-ableton-max-for-live-toy-concatenative-synthesis-skatart.115599/
Date: 2021-10-12
Excerpt: "SKataRT is a Max for Live device / instrument which brings together synthesis techniques from CataRT and synthesis techniques by mosaicing."
Context: SKataRT represents the attempt to bring concatenative synthesis into DAW workflows via Max for Live.
Confidence: medium

### 8.3 The Concatenator (ISMIR 2024) and DataMind Audio

Claim: Chris Tralie and Ben Cantil presented "The Concatenator: A Bayesian Approach to Real Time Concatenative Musaicing" at ISMIR 2024, which "improved on the speed, accuracy, and playability of prior realtime concatenative synthesis methods"; the algorithm serves as the engine behind the Concatenator plugin by DataMind Audio[^313^][^267^]
Source: Tralie/Cantil website; Sound on Sound
URL: https://www.ctralie.com/TheConcatenator/; https://www.soundonsound.com/news/concatenator-datamind-audio
Date: Unknown; 2025-04-16
Excerpt (Tralie): "The Concatenator: A bayesian approach to real time concatenative musaicing. In Proceedings of the 25th Conference of the International Society for Music Information Retrieval (ISMIR 2024)."
Excerpt (SOS): "Described as an 'audio mosaicking tool', Concatenator can be used to create complex new sounds and textures based on any audio file or input source. The innovative new instrument relies on a new form of synthesis which has been developed by Datamind Audio. Named Concatenative Sound Synthesis, the approach is said to be similar in concept to granular synthesis, but with the grain selection, amount and size parameters influenced by an audio input signal rather than being chosen at random."
Context: The Concatenator is the first major commercial concatenative synthesis plugin, priced at $149.
Confidence: high

### 8.4 Rob Clouth's Reconstructor and NMF-Inspired Mosaicing

Claim: Rob Clouth's album Zero Point (Mesh 2020) featured self-made concatenative synthesis software called the 'Reconstructor' which "chops sampled sounds into tiny pieces and rearranges them to replicate a target sound"; the algorithm was adapted from Driedger, Prätzlich, and Müller's "Let It Bee — Towards NMF-Inspired Audio Mosaicing" (2015); Clouth's work was cited as inspiration for The Concatenator[^396^]
Source: Wikipedia — Concatenative Synthesis
URL: https://en.wikipedia.org/wiki/Concatenative_synthesis
Date: 2010 (article updated)
Excerpt: "Zero Point, the first full-length album by Rob Clouth (Mesh 2020), features self-made concatenative synthesis software called the 'Reconstructor' which 'chops sampled sounds into tiny pieces and rearranges them to replicate a target sound.'"
Context: Clouth represents the independent artist/programmer approach to concatenative synthesis.
Confidence: high

---

## 9. Where the Boundaries Blur

### 9.1 Neural Approaches: Granular in Latent Space

Claim: Adrien Bitton, Philippe Esling, and Takuro Harada introduced "Neural Granular Sound Synthesis" (ICMC 2021), demonstrating that "generative neural networks can implement granular synthesis while alleviating most of its shortcomings" — they replace the audio descriptor basis with "a probabilistic latent space learned with a Variational Auto-Encoder" making the grain space continuously invertible and eliminating the need to store original grains[^379^]
Source: arXiv — Neural Granular Sound Synthesis
URL: https://arxiv.org/abs/2008.01393
Date: 2020-08-04 (published ICMC 2021)
Excerpt: "We demonstrate that generative neural networks can implement granular synthesis while alleviating most of its shortcomings. We efficiently replace its audio descriptor basis by a probabilistic latent space learned with a Variational Auto-Encoder. In this setting the learned grain space is invertible, meaning that we can continuously synthesize sound when traversing its dimensions. It also implies that original grains are not stored for synthesis. Another major advantage of our approach is to learn structured paths inside this latent space by training a higher-level temporal embedding over arranged grain sequences."
Context: Neural granular synthesis dissolves the distinction between time-domain and descriptor-based approaches by learning representations.
Confidence: high

Claim: Nao Tokui and Tom Baker introduced "Latent Granular Resynthesis using Neural Audio Codecs" (ISMIR 2025 late-breaking demo), which creates a "granular codebook" by encoding a source corpus into latent vector segments, then matches each latent grain of a target to its closest counterpart in the codebook; this "requires no model training, works with diverse audio materials, and naturally avoids the discontinuities typical of traditional concatenative synthesis through the codec's implicit interpolation during decoding"[^388^]
Source: arXiv — Latent Granular Resynthesis using Neural Audio Codecs
URL: https://arxiv.org/abs/2507.19202
Date: 2025-07-25
Excerpt: "We introduce a novel technique for creative audio resynthesis that operates by reworking the concept of granular synthesis at the latent vector level. Our approach creates a 'granular codebook' by encoding a source audio corpus into latent vector segments, then matches each latent grain of a target audio signal to its closest counterpart in the codebook."
Context: This 2025 work explicitly blurs the granular/concatenative boundary by using neural codecs as the synthesis engine.
Confidence: high

### 9.2 The Continuum Perspective

Claim: The boundaries between granular synthesis, concatenative synthesis, sampling, and micromontage become blurred when unit sizes increase; as Daniele Ghisi notes, "whenever the morphology of the sampled sounds is still present in the result this technique should be more aptly named 'concatenative sampling'"[^348^]
Source: Ghisi PhD thesis
URL: https://www.danieleghisi.com/phd/PHDThesis_20180118.pdf
Date: 2018
Excerpt: "Exactly as in the case of granular synthesis, one might argue that whenever the morphology of the sampled sounds is still present in the result this technique should be more aptly named 'concatenative sampling'."
Context: The terminology itself becomes unstable at the boundary regions.
Confidence: high

Claim: In modern DAWs, the distinction is further blurred by features like Ableton Live 12's "Sound Similarity Search" which uses neural networks to find sounds similar to a reference file, and "Similar Sample Swapping" in Simpler and Drum Rack — these are effectively descriptor-based selection mechanisms entering mainstream sampling workflows[^346^]
Source: Ableton Live 12 Release Notes
URL: https://www.ableton.com/en/release-notes/live-12/
Date: 2026-04-24
Excerpt: "Similarity Search can be used to find sounds similar to a reference file and works with audio samples, instrument presets, and drum presets... Core Library content is pre-analyzed for sound similarity features."
Context: Mainstream DAWs are quietly integrating descriptor-based selection (the core innovation of concatenative synthesis) into conventional sampling.
Confidence: high

### 9.3 Granular Synthesis as a Precursor to Concatenative

Claim: The scholarly consensus positions granular synthesis as a conceptual and technical precursor to concatenative synthesis: "concatenative synthesis for music started to develop in the 2000s in particular through the work of Schwarz and Pachet" following decades of granular development; corpus-based concatenative synthesis "directly derives from granular synthesis"[^285^][^348^]
Source: Wikipedia — Concatenative Synthesis; Ghisi PhD thesis
URL: https://en.wikipedia.org/wiki/Concatenative_synthesis; https://www.danieleghisi.com/phd/PHDThesis_20180118.pdf
Date: 2010; 2018
Excerpt (Wikipedia): "Concatenative synthesis for music started to develop in the 2000s in particular through the work of Schwarz and Pachet (so-called musaicing)."
Excerpt (Ghisi): "Corpus-based concatenative synthesis[Schwarz, 2007] directly derives from granular synthesis, and provides mechanisms for sequencing of 'grains' according to their proximity in some descriptor space."
Context: The historical lineage is clear: granular (position-based, small units) → concatenative (descriptor-based, larger units, analyzed corpus).
Confidence: high

---

## 10. Key Actors, Institutions, and Projects

### 10.1 Foundational Researchers

| Researcher | Institution | Contribution |
|---|---|---|
| Dennis Gabor | British Thomson-Houston / Imperial College | 1947: Acoustic quanta theory (Theory of Communication) |
| Iannis Xenakis | GRM, Paris / CEMAMu | 1959: Analogique A-B — first musical granular composition |
| Curtis Roads | UCSD / MIT / IRCAM | 1974: First computer implementation; 2001: Microsound |
| Barry Truax | Simon Fraser University | 1986: First real-time granular synthesis (GSX/Riverrun) |
| Diemo Schwarz | IRCAM | 2000s: Caterpillar, CataRT — corpus-based concatenative |
| François Pachet | Sony CSL Paris | 2001: Musical Mosaicing (with Zils) |
| Aymeric Zils | Sony CSL Paris | 2001: Musical Mosaicing |

### 10.2 Open-Source and Institutional Projects

- **CataRT**: IRCAM, free open source (GPL), Max/MSP + FTM library
- **Cloud Generator**: Curtis Roads, free teaching tool
- **Granulator II/III**: Robert Henke, bundled with Ableton Live (Max for Live)
- **SKataRT**: IRCAM Forum, Max for Live device (subscription)
- **PointZero**: Free Max patch by Encanti, FluCoMa-powered NMF-based concatenative
- **Latent Granular**: Tokui/Baker, open-source Python/HuggingFace demo

### 10.3 Commercial Products

| Product | Company | Type | Price (2024-2026) |
|---|---|---|---|
| Output Portal | Output | Granular FX | $149 |
| Arturia Pigments 5/6 | Arturia | Multi-engine synth (incl. granular) | $199 |
| Omnisphere 2.5/3 | Spectrasonics | Multi-engine synth (incl. granular) | $499 |
| Granulator III | Ableton / Robert Henke | Bundled with Live 12 | Bundled |
| Clouds / Texture | Mutable Instruments | Eurorack granular module | Discontinued/variant |
| Straylight / Ashlight | Native Instruments | Kontakt granular libraries | $149-199 |
| GRM Tools | INA-GRM | Spectral/granular FX suite | $350-800 |
| Concatenator | DataMind Audio | Concatenative synthesis | $149 |
| Efx Fragments | Arturia | Granular FX | $99 |
| Graindad | Sugar Bytes | Granular FX | $99 |

---

## 11. Tensions, Counter-Narratives, and Debates

### 11.1 Market vs. Research Divide

Claim: Granular synthesis dominates the commercial plugin market while concatenative synthesis remains largely an academic/research pursuit; the only major commercial concatenative product as of 2025 is DataMind Audio's Concatenator, which was still in beta as of early 2025[^267^]
Source: Sound on Sound
URL: https://www.soundonsound.com/news/concatenator-datamind-audio
Date: 2025-04-16
Excerpt: "The new algorithm serves as the engine behind the Concatenator plugin by DataMind Audio, which is currently still in beta."
Context: This market asymmetry raises questions about whether concatenative synthesis's complexity (corpus preparation, descriptor analysis) is too high a barrier for mainstream adoption.
Confidence: high

### 11.2 The "Grainy" Artifact Problem

Claim: Granular synthesis methods can lead to a "grainy" or "fluttering" sound, especially noticeable in sustained parts, while phase vocoders can introduce "smearing" or metallic artifacts with percussive content; transient-aware algorithms attempt to bridge this gap[^447^]
Source: Lucid Samples
URL: https://www.lucidsamples.com/blog/time-stretching-samples-without-artifacts-advanced-techniques-explained
Date: 2025-11-08
Excerpt: "Granular synthesis-based methods break the audio into tiny segments (grains) and then re-arrange, overlap, and crossfade them... This approach can be excellent for creating textural effects and handling complex audio, but if not carefully managed, it can lead to a 'grainy' or 'fluttering' sound."
Context: The artifact profiles of different granulation methods remain an active area of DSP research.
Confidence: medium

### 11.3 Real-Time vs. Deferred Processing

Claim: Real-time concatenative synthesis "can not provide a globally optimal selection, because the target is not known entirely in advance" and "concatenation quality is rarely included in the selection algorithm" — this is a fundamental limitation compared to offline systems like Caterpillar[^80^]
Source: Schwarz et al., DAFx 2006
URL: https://www.dafx.de/paper-archive/2006/papers/p_279.pdf
Date: 2006
Excerpt: "Contrary to the systems above, real-time concatenative synthesis systems can not provide a globally optimal selection, because the target is not known entirely in advance. Also, concatenation quality is rarely included in the selection algorithm."
Context: The tension between real-time interactivity and optimal selection quality remains unresolved.
Confidence: high

### 11.4 Descriptor Quality Limitations

Claim: Neural granular synthesis explicitly addresses the limitation that "the quality of this grain space is bound by that of the descriptors. Its traversal is not continuously invertible to signal and does not render any structured temporality"[^379^]
Source: Bitton et al., Neural Granular Sound Synthesis
URL: https://arxiv.org/abs/2008.01393
Date: 2020
Excerpt: "However, the quality of this grain space is bound by that of the descriptors. Its traversal is not continuously invertible to signal and does not render any structured temporality."
Context: This critique from the neural synthesis perspective highlights fundamental limitations of classical descriptor-based approaches.
Confidence: high

---

## 12. Current State (2024–2026): Key Developments

### 12.1 The Neural Turn

Claim: The most significant recent development is the application of neural audio codecs to granular/concatenative resynthesis — Latent Granular Resynthesis (2025) operates on pre-trained codec latent spaces, requires no training, and achieves "smooth timbral blending while preserving the structural characteristics of target audio signals"[^388^]
Source: Tokui & Baker, ISMIR 2025
URL: https://arxiv.org/abs/2507.19202
Date: 2025-07-25
Excerpt: "We have presented a novel technique that leverages neural audio codecs for creative granular resynthesis, enabling high fidelity, versatile, no-training timbre transfer. By operating in the latent space of pre-trained codecs, our approach achieves smooth timbral blending while preserving the structural characteristics of target audio signals."
Context: Neural codecs are dissolving the traditional boundary between analysis and synthesis.
Confidence: high

### 12.2 DAW Integration of Granular + Analysis

Claim: Ableton Live 12 (2024) integrates both granular synthesis (Granulator III with MPE) and machine-learning-based sound similarity search, effectively merging granular playback with descriptor-based selection in a mainstream DAW[^342^][^346^]
Source: Ableton.com; Ableton Release Notes
URL: https://www.ableton.com/en/live/all-new-features/; https://www.ableton.com/en/release-notes/live-12/
Date: Unknown; 2026-04-24
Excerpt: "Sound Similarity Search. Start with a sample and tell Live's browser to find comparable sounds and instrument presets, with the help of machine learning algorithms."
Context: This represents the mainstreaming of concepts that originated in concatenative synthesis research.
Confidence: high

### 12.3 Hardware Granular Renaissance

Claim: Eurorack granular modules continue to proliferate; Mutable Instruments Clouds (2014) spawned "dozens of variants" through open-source firmware; successors and alternatives include Morphagene (Make Noise), Nebulae (Qu-Bit), Granularis, and various DIY projects[^272^][^393^]
Source: Perfect Circuit; Produce Like A Pro
URL: https://www.perfectcircuit.com/signal/mutable-clouds-retrospective; https://producelikeapro.com/blog/understanding-granular-synthesis/
Date: 2025-06-17; 2021-07-15
Excerpt: "There are a number of modular synthesizers available in the Eurorack format, all of which explore the possibilities of granular synthesis without a computer."
Context: Hardware granular synthesis has become a staple of modular synthesis.
Confidence: high

---

## 13. Citation Index

[^1^] Schwarz et al., "Real-Time Corpus-Based Concatenative Synthesis with CataRT," DAFx 2006. https://www.dafx.de/paper-archive/2006/papers/p_279.pdf

[^2^] Roads, Curtis. Microsound. MIT Press, 2001. https://monoskop.org/images/d/d1/Roads_Curtis_Microsound.pdf

[^3^] Schwarz et al., "Principles and Applications of Interactive Corpus-Based Concatenative Synthesis," JIM 2008. http://jim.afim-asso.org/jim08/upload/05_Schwarz_catart-jim2008-final.pdf

[^4^] Roads et al., "Architecture for Real-Time Granular Synthesis," Computer Music Journal. https://www.curtisroads.net/s/7-RoadsKilgoreDuPlessis-CMJ-copy.pdf

[^5^] Xenakis Organization / Di Scipio, "Granular Synthesis." https://www.iannis-xenakis.org/en/granular-synthesis/

[^6^] Schwarz, "Concatenative Sound Synthesis." http://articles.ircam.fr/textes/Schwarz06b/index.pdf

[^7^] Stovall, "Granular Synthesis: An Overview." https://joshstovall.com/writing/granular-synthesis/

[^8^] Tralie & Cantil, "The Concatenator," ISMIR 2024. https://www.ctralie.com/TheConcatenator/

[^9^] Sound on Sound, "Concatenator from Datamind Audio." https://www.soundonsound.com/news/concatenator-datamind-audio

[^10^] Vapi.ai, "How to Create Natural Audio Using Concatenative Synthesis." https://vapi.ai/blog/concatenative-synthesis

[^11^] Wikipedia, "Concatenative synthesis." https://en.wikipedia.org/wiki/Concatenative_synthesis

[^12^] Mutable Instruments, "Clouds history." https://pichenettes.github.io/mutable-instruments-documentation/trivia_and_history/clouds_history/

[^13^] Perfect Circuit, "Mutable Instruments Clouds Retrospective." https://www.perfectcircuit.com/signal/mutable-clouds-retrospective

[^14^] ijc8.me, "Adventures in Synthesis: Emulating the GSX." https://ijc8.me/2020/09/06/emulating-the-gsx/

[^15^] Granular Synthesis Resource, "Synchronous/Asynchronous." https://www.granularsynthesis.com/hthesis/sync.html

[^16^] Tokui & Baker, "Latent Granular Resynthesis using Neural Audio Codecs," ISMIR 2025. https://arxiv.org/abs/2507.19202

[^17^] Bitton, Esling & Harada, "Neural Granular Sound Synthesis," ICMC 2021. https://arxiv.org/abs/2008.01393

[^18^] Ableton, "All new features in Live 12." https://www.ableton.com/en/live/all-new-features/

[^19^] Sound on Sound, "Ableton Live 12: Granulator III." https://www.soundonsound.com/techniques/ableton-live-12-granulator-iii

[^20^] Robert Henke, "Granulator II." https://roberthenke.com/technology/granulator.html

[^21^] Arturia, "Pigments — Sound Design VST Synthesizer." https://www.arturia.com/products/software-instruments/pigments/overview

[^22^] Spectrasonics, "Omnisphere 2.5." https://www.spectrasonics.net/news/news-content.php?id=112

[^23^] Spectrasonics, "Omnisphere 1.5 Update." https://www.spectrasonics.net/news/news-content.php?id=52

[^24^] MusicTech, "iZotope discontinues Iris 2." https://musictech.com/news/gear/izotope-discontinues-iris2-breaktweaker-trash-2-plugins/

[^25^] Sound on Sound, "INA GRM Tools 3." https://www.soundonsound.com/reviews/ina-grm-tools-3

[^26^] CMU, "Phase Vocoder Tutorial." https://www.cs.cmu.edu/~music/nyquist/extensions/pvoc/phasevocoder.html

[^27^] Produce Like A Pro, "Understanding Granular Synthesis." https://producelikeapro.com/blog/understanding-granular-synthesis/

[^28^] Ghisi, PhD thesis. https://www.danieleghisi.com/phd/PHDThesis_20180118.pdf

[^29^] Wikipedia, "Granular synthesis." https://en.wikipedia.org/wiki/Granular_synthesis

[^30^] Zils & Pachet, "Musical Mosaicing," DAFx 2001.

[^31^] FRCTLAUDIO, "GRN vs Output Portal." https://frctlaudio.com/blog/grn-vs-output-portal

[^32^] Artists in DSP, "Best 15 Granular Synthesis VST Plugins in 2026." https://artistsindsp.com/the-best-15-granular-synthesis-vst-plugins-in-2026/

---

## 14. Summary of Findings

### What is happening NOW (2024–2026):
- **Granular synthesis dominates** the commercial plugin market with products like Output Portal, Arturia Pigments, Omnisphere, Ableton Granulator III, and numerous Eurorack modules.
- **Concatenative synthesis** is emerging commercially for the first time with DataMind Audio's Concatenator (ISMIR 2024), but remains primarily an academic/research domain centered at IRCAM.
- **Neural approaches** (Neural Granular Sound Synthesis, Latent Granular Resynthesis) are blurring boundaries by operating on learned latent spaces rather than raw waveform grains.
- **Mainstream DAWs** (Ableton Live 12) are integrating machine-learning-based sound similarity search, quietly adopting concatenative-style descriptor-based selection.

### How did we get here:
- **1947**: Gabor's acoustic quanta theory.
- **1959**: Xenakis's Analogique A-B — first musical granular composition (analog tape).
- **1974**: Roads's first computer implementation (offline, mainframe).
- **1986**: Truax's first real-time granular synthesis (GSX).
- **1995**: Roads's Cloud Generator — pedagogical tool.
- **2000s**: Schwarz's Caterpillar/CataRT (IRCAM) — corpus-based concatenative synthesis bridging granular and descriptor-based selection.
- **2001**: Zils & Pachet's Musical Mosaicing — constraint-based unit selection.
- **2014**: Mutable Instruments Clouds — hardware democratization.
- **2020-2025**: Neural synthesis approaches dissolve traditional boundaries.

### Key tensions:
- **Position-based vs. descriptor-based selection**: The core divergence. Granular selects by time-position; concatenative selects by content similarity in descriptor space.
- **Unit size continuum**: Grains (~1-50ms) vs. concatenative units (100ms-several seconds). Boundaries blur at intermediate sizes.
- **Real-time vs. optimal**: Real-time concatenative cannot achieve globally optimal selection; this remains a fundamental limitation.
- **Market vs. research**: Granular synthesis has achieved mass-market adoption; concatenative synthesis remains complex and niche.
- **Analysis requirement**: Concatenative requires pre-analysis of the corpus; granular does not. This overhead is a barrier to adoption.

### The single most important relationship:
As Diemo Schwarz formulated it, concatenative synthesis is a "natural extension of granular synthesis, augmented by content-based selection and control." Granular synthesis is "rudimentarily corpus-based" — the corpus is a single sound file, selection is by position, and there is no analysis. Concatenative synthesis adds: (1) multi-source corpora, (2) analysis and descriptors, (3) content-based selection algorithms. Modern neural approaches are now adding a fourth layer: learned latent representations that bypass hand-designed descriptors entirely.
