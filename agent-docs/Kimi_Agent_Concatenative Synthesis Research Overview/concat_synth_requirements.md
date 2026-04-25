# Requirements Analysis: Concatenative Synthesis Deep Research Report

## 1. Explicit Requirements

### 1.1 Technical Depth
- The report must cover concatenative synthesis at a deep, non-superficial level. The user explicitly requests "very deep research."

### 1.2 Technique Coverage
- Corpus concatenative synthesis techniques: how corpuses of sampled materials are built, organized, and used.
- Real-time concatenative synthesis: algorithms, latency constraints, streaming approaches, and live performance considerations.
- General concatenative synthesis methods: unit selection, segment matching, feature extraction, and audio mosaicking.

### 1.3 Market Analysis
- Survey of existing commercial and open-source concatenative synthesizers.
- What competing and complementary tools currently exist in the market.
- What developers and companies are doing in this space now.

### 1.4 Creative and Research Angles
- Creative approaches that have been proposed or demonstrated in research literature.
- Novel research directions: new algorithms, hybrid methods, and unconventional applications.

### 1.5 Neural Synthesis Focus
- Intersection of concatenative synthesis with neural synthesis methods.
- How neural networks (e.g., autoencoders, diffusion models, transformers) are being applied to corpus-based audio generation.
- Neural replacements or augmentations for traditional unit-selection and matching pipelines.

### 1.6 Corpus-Centric View
- Classification of corpuses of sound: how sound databases are categorized, tagged, and structured.
- Interesting playback and transformation strategies for corpus materials.
- The entire pipeline from corpus construction to synthesis output.

---

## 2. Implicit Requirements

### 2.1 Historical Context
- The user implies a need for historical background: concatenative synthesis has roots in speech synthesis (e.g., Festival, MBROLA), early musical tools (e.g., CataRT, Aalto), and precursor ideas in granular synthesis. The report should trace conceptual lineages without being asked directly.

### 2.2 Technical Foundations
- Implicit expectation of DSP fundamentals: spectral analysis, feature vectors (MFCC, chroma, spectral centroid, zero-crossing rate), distance metrics, and search/indexing structures (k-d trees, vantage point trees, approximate nearest neighbor).
- Signal representation: time-domain vs. spectral-domain concatenative methods.

### 2.3 Implementation and Engineering Considerations
- Real-time implies discussion of CPU load, memory management, threading models, and low-latency audio I/O.
- Cross-platform concerns (desktop vs. embedded vs. web audio).
- Data structures for fast nearest-neighbor lookup in large corpuses.

### 2.4 Evaluation Methodologies
- How concatenative synthesis quality is measured: objective metrics (spectral distortion, naturalness scores) and subjective listening tests.
- Benchmark datasets and standardized corpuses used in the field.

### 2.5 Interdisciplinary Connections
- Links to adjacent fields: granular synthesis, wavetable synthesis, sampling, physical modeling, and audio mosaicking.
- Connection to MIR (Music Information Retrieval) for corpus analysis.
- Ties to machine listening and audio embeddings (e.g., OpenL3, CLAP, Jukebox embeddings).

### 2.6 Open Problems and Future Directions
- The call for "novel research" implies identification of gaps, limitations of current methods, and promising future directions.
- Scalability: how methods scale from megabytes to terabytes of audio.
- Generalization: cross-corpus synthesis, style transfer, and controllable generation.

### 2.7 Creative Applications
- The user is interested in creative use, not just technical abstraction. Implicit need for artist/toolmaker case studies, compositional workflows, and live performance contexts.
- Electronic music and sound art communities where concatenative synthesis is practiced (e.g., IRCAM, BEAST, experimental electronic music).

---

## 3. Scope Boundaries

### 3.1 Include
- Concatenative synthesis algorithms and architectures.
- Corpus construction, annotation, and classification schemes.
- Real-time and offline concatenative synthesis systems.
- Commercial and open-source software tools (e.g., CataRT, AudioGuide, Omnibus, FluCoMa, Max/MSP externals, SuperCollider UGens, Ableton Live devices).
- Neural audio synthesis methods relevant to corpus-based generation (e.g., NN-based unit selection, embedding spaces for audio segments, neural audio codecs as feature extractors).
- Research papers, patents, and dissertations in the field.
- Creative and artistic projects using these techniques.
- Hybrid systems combining classical DSP and neural approaches.

### 3.2 Exclude
- Pure speech synthesis systems unless they directly inform musical concatenative synthesis (e.g., Festival unit selection is relevant; a deep dive into TTS commercial products like Google TTS is not).
- General digital signal processing tutorials or introductory materials not specific to concatenative synthesis.
- Music synthesis methods with no corpus component (e.g., pure subtractive synthesis, FM synthesis without sample corpus involvement).
- Neural audio synthesis with no concatenative or corpus component (e.g., a pure diffusion model generating audio from scratch without unit selection or corpus conditioning should only be discussed if it relates to the hybrid space).
- Legal/licensing issues around sample corpora unless directly relevant to open research datasets.
- Hardware synthesizer market analysis unless the hardware implements concatenative synthesis (e.g., some wavetable or granular synths may be relevant at the boundary).

### 3.3 Boundary Ambiguities
- Granular synthesis: include where it overlaps with corpus playback and unit concatenation; exclude where it is purely synthetic grain generation.
- Sampling keyboards and ROMplers: include only if they feature intelligent matching, mosaicking, or classification; exclude simple keyzone playback.
- Loop-based production (e.g., Ableton Live session view): include only if there is algorithmic matching, intelligent rearrangement, or concatenative synthesis research applied.

---

## 4. Deliverable Characteristics

### 4.1 Format
- A written report, likely long-form (estimated 8,000 to 15,000+ words for "very deep research").
- Organized by thematic sections, not a simple list.
- Citations to papers, projects, and products (formal academic citations preferred given the user's technical level).
- Possibly sub-reports or clearly delineated deep dives per sub-topic.

### 4.2 Depth
- Deep enough that a practicing developer or advanced researcher would find new information and connections.
- Technical detail should include algorithmic descriptions, mathematical foundations where relevant, and discussion of trade-offs.
- Not a popular science article; should assume reader familiarity with DSP, machine learning, and synthesis concepts.

### 4.3 Tone
- Professional, analytical, and technically precise.
- Enthusiastic but rigorous: matching someone deeply interested in the field.
- Critical evaluation: not merely cataloging, but assessing quality, novelty, and practical viability of techniques and products.

### 4.4 Audience
- Likely a researcher, audio software developer, or advanced electronic musician/composer.
- Someone capable of reading research papers and implementing algorithms.
- Not a beginner in audio synthesis or DSP.

### 4.5 Structure
- Expected sections include:
  - Introduction and conceptual framework
  - Historical lineage
  - Core techniques (unit selection, feature extraction, matching, transitions)
  - Corpus construction and classification
  - Real-time synthesis architectures
  - Market survey of tools and platforms
  - Creative and artistic applications
  - Neural synthesis intersections
  - Novel and frontier research
  - Open problems and future directions
  - Comprehensive bibliography

---

## 5. Key Questions the Report Must Answer

### 5.1 Technical Questions
1. What are the canonical algorithms for unit selection and audio mosaicking in concatenative synthesis?
2. How is a corpus of sound analyzed, segmented, and represented as feature vectors?
3. What distance metrics and search data structures enable real-time matching against large corpuses?
4. How are transitions and crossfades handled between concatenated units to avoid artifacts?
5. What are the CPU and memory trade-offs for real-time vs. offline concatenative synthesis?

### 5.6 Corpus and Classification Questions
6. What schemes exist for classifying and tagging sound corpora (metadata, content-based retrieval, embedding spaces)?
7. How large can corpuses practically be, and what are the scaling bottlenecks?

### 5.3 Market and Tool Questions
8. What concatenative synthesis tools exist today (commercial, open-source, research prototypes), and what are their distinguishing features?
9. Which tools are maintained, which are abandoned, and what gaps exist in the current ecosystem?
10. What platforms and environments (Max/MSP, SuperCollider, Pure Data, VST/AU, Python, etc.) support concatenative synthesis workflows?

### 5.4 Creative and Research Questions
11. What creative applications and artworks have prominently used concatenative synthesis?
12. What novel research directions are currently being explored (e.g., differentiable concatenative synthesis, reinforcement learning for unit selection, neural embedding-driven mosaicking)?
13. How are researchers pushing beyond traditional unit selection into new forms of corpus-driven generation?

### 5.5 Neural Synthesis Questions
14. How are neural networks being used to replace or augment traditional concatenative synthesis pipelines?
15. What role do audio embeddings (neural feature extractors) play in modern corpus-based synthesis?
16. Are there neural models that explicitly perform or approximate concatenative synthesis end-to-end?
17. How do neural synthesis methods compare in quality, controllability, and computational cost to classical concatenative approaches?

### 5.6 Synthesis and Integration Questions
18. What hybrid architectures combine neural and classical concatenative synthesis, and what advantages do they offer?
19. What are the major unsolved problems or limitations in the field?
20. What does the future landscape of corpus-based audio generation look like?

---

## 6. Success Criteria

### 6.1 Coverage
- All explicitly mentioned sub-topics (techniques, market, creative angles, novel research, neural synthesis) are addressed with substantive content, not superficial mentions.
- No major concatenative synthesis tool, research paper, or significant project in the space is omitted without justification.

### 6.2 Depth
- Technical explanations go beyond Wikipedia-level descriptions.
- Algorithmic and mathematical foundations are included where they illuminate how methods work.
- Trade-offs between approaches are discussed.

### 6.3 Currency
- Information reflects the current state of the field as of the report's production date.
- Recent neural synthesis advances (last 2 to 5 years) are included.
- Active vs. discontinued projects are distinguished.

### 6.4 Accuracy
- Technical claims are correct and verifiable.
- Citations are accurate and point to genuine sources.
- Tool descriptions match actual capabilities.

### 6.5 Critical Value
- The report does more than list; it analyzes, compares, and evaluates.
- The reader gains insight into what is genuinely novel vs. incremental.
- Recommendations or informed opinions on the state of the art are present.

### 6.6 Utility
- A developer or researcher reading this report could use it to:
  - Choose a tool or framework for a project.
  - Identify research gaps for a new publication.
  - Understand the algorithmic options available for building a new system.
  - Gain historical perspective on the evolution of the field.
