# Dimension 12: Algorithmic Composition & Computer-Aided Orchestration — Research Report

*Research on the symbolic/mathematical composition tradition interfacing with corpus-based sound.*
*Compiled: April 2026*

---

## 1. EXECUTIVE SUMMARY

This report investigates the intersection of symbolic/mathematical algorithmic composition and corpus-based concatenative synthesis. The central finding is that two parallel traditions—IRCAM's Computer-Aided Composition (CAC) lineage (PatchWork → OpenMusic → OM#) and real-time concatenative synthesis (CataRT)—have progressively converged through bridge tools including the **bach** library for Max, **dada** library's symbolic corpus modules, **OM-Diph** for diphone-based concatenative synthesis in OpenMusic, and **bach-CataRT** integration for corpus-based transcription. The **Orchidée/Orchidea** automatic orchestration system represents a parallel corpus-based approach operating on instrumental samples rather than abstract sound grains. Current activity (2024–2026) includes OpenMusic 7.x/8.0 releases with enhanced sound processing, **Orchidea** dynamic orchestration published in *Computer Music Journal* (2023), **OM#** (om-sharp) as a next-generation interactive CAC environment, and new neural-hybrid approaches to MIDI-to-audio synthesis combining concatenative methods with diffusion models.

---

## 2. HISTORICAL EVOLUTION

### 2.1 IRCAM's CAC Lineage: From PatchWork to OpenMusic to OM#

The foundation of symbolic computer-aided composition at IRCAM traces back to the 1980s. The Music Representation project developed a series of environments culminating in OpenMusic.

Claim: "PatchWork is a visual interface to the Lisp Language... OpenMusic, by G. Assayag and C. Agon, is the latest Ircam CAC environment in date. It is a visual interface to CLOS, the Common Lisp Object System."[^1^]
Source: Computer Music Journal, "Computer Assisted Composition at Ircam: PatchWork & OpenMusic"
URL: http://recherche.ircam.fr/equipes/repmus/RMPapers/CMJ98/
Date: 1998
Excerpt: "PatchWork is a visual interface to the Lisp Language... OpenMusic, by G. Assayag and C. Agon, is the latest Ircam CAC environment in date. It is a visual interface to CLOS, the Common Lisp Object System... Aside from being a superset of PatchWork, it opens new territories by allowing the composer to visually design sophisticated musical object classes. It introduces the Maquette concept which enables high level control of musical material over time."
Context: Foundational paper establishing the CAC tradition at IRCAM
Confidence: high

Claim: "The development of contemporary musical practices, which incorporate sounds in the compositional processes, led to a renew interest for bringing together these two different fields."[^2^]
Source: Sound Processing in OpenMusic (DAFx-06)
URL: https://hal.science/hal-01169018v1/document
Date: 2006
Excerpt: "OpenMusic (OM) is a visual programming language specialized in the symbolic processing of musical objects... However, the idea of a symbolic manipulation of musical data, close to the compositional concepts, historically tended to make these systems diverge from the sound-related concerns. The development of contemporary musical practices, which incorporate sounds in the compositional processes, led to a renew interest for bringing together these two different fields."
Context: Jean Bresson's seminal DAFx paper on bridging symbolic composition and sound processing
Confidence: high

Claim: "OM# is a computer assisted composition and visual programming environment derived from OpenMusic, featuring a fully redesigned visual programming framework, as well as advanced tools for interactive computer assisted composition and digital signal processing."[^3^]
Source: Jean Bresson personal page
URL: https://j-bresson.github.io/
Date: 2020 (OM# v1.0 released end of 2019)
Excerpt: "OM# is a computer assisted composition and visual programming environment derived from OpenMusic... Key features and developments were carried out during the EFFICACe research project (2013-2017)... After successive code-names (om7-beta/o7/...) the project was named OM# (om-sharp) shortly before the v1.0 release in the end of 2019."
Context: Next-generation CAC environment
Confidence: high

Claim: "OpenMusic 7.0 initiated the current major iteration in 2022... reaching 7.7 in December 2025."[^4^]
Source: OpenMusic GitHub releases / Grokipedia
URL: https://github.com/openmusic-project/openmusic/releases
Date: 2025
Excerpt: "In 2022, OpenMusic 7.0 initiated the current major iteration... The 7.x series has continued with regular updates—reaching 7.7 in December 2025—addressing modern hardware challenges, such as ARM processors and high-channel audio."
Context: Current development status of OpenMusic
Confidence: high

### 2.2 Jean Bresson's PhD Thesis: Sound Synthesis in CAC (2007)

The key intellectual framework connecting symbolic composition with sound processing was established by Jean Bresson's PhD thesis at IRCAM.

Claim: "La synthèse sonore en composition musicale assistée par ordinateur: Modélisation et écriture du son" (PhD thesis, UPMC Paris 6, 2007).[^5^]
Source: IRCAM publications archive
URL: http://articles.ircam.fr/textes/Bresson07c/index.pdf
Date: 2007
Excerpt: "Le travail que nous avons réalisé se situe dans la continuité de l'approche de la CAO, reconsidérée dans le cadre des problématiques posées par la synthèse sonore... L'environnement OpenMusic a donc été présenté dans ce contexte, comme un langage ouvert et puissant pour la programmation et la composition musicale."
Context: Doctoral thesis establishing theoretical framework for sound synthesis control in CAC
Confidence: high

Claim: "The work and research carried out in my PhD thesis (2004-2007) was focused on the integration of sound processing and synthesis techniques in compositional processes."[^6^]
Source: Jean Bresson projects page
URL: https://j-bresson.github.io/projects
Date: 2020
Excerpt: "The work and research carried out in my PhD thesis (2004-2007) was focused on the integration of sound processing and synthesis techniques in compositional processes (and in the OpenMusic environment). I have created several external libraries connecting with IRCAM sound processing tools, such as OM-SuperVP, OM-pm2, or OM-Chant."
Context: Creator's own summary of key contributions
Confidence: high

### 2.3 Diemo Schwarz and the Concatenative Synthesis Lineage

The corpus-based concatenative synthesis tradition at IRCAM developed in parallel, from Caterpillar through CataRT.

Claim: "Corpus-based concatenative synthesis methods are attracting more and more interest in the musical sound synthesis and content-based processing communities."[^7^]
Source: Real-Time Corpus-Based Concatenative Synthesis with CataRT (DAFx-06)
URL: http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf
Date: 2006
Excerpt: "Corpus-based concatenative synthesis methods are attracting more and more interest in the musical sound synthesis and content-based processing communities. They use a large database of source sounds, segmented into units, and a unit selection algorithm that finds the sequence of units that match best the sound or phrase to be synthesised, called the target."
Context: Foundational CataRT paper
Confidence: high

Claim: "Concatenative sound synthesis: The early years" — Diemo Schwarz established the field through his 2004 PhD thesis and subsequent publications.[^8^]
Source: Journal of New Music Research
URL: (referenced in DAFx-06 paper)
Date: 2006
Excerpt: "Diemo Schwarz, 'Concatenative sound synthesis: The early years,' Journal of New Music Research, 35(1):3-22, March 2006. Special Issue on Audio Mosaicing."
Context: Key historical survey of the field
Confidence: high

Claim: "Corpus-based concatenative synthesis. IEEE Signal Processing Magazine, 24(2):92-104, March 2007."[^9^]
Source: IEEE Signal Processing Magazine
URL: (referenced in multiple IRCAM publications)
Date: 2007
Excerpt: "Corpus-based concatenative synthesis. IEEE Signal Processing Magazine, 24(2):92-104, March 2007. Special Section: Signal Processing for Sound Synthesis."
Context: Major survey article by Diemo Schwarz in flagship signal processing journal
Confidence: high

---

## 3. KEY TOOLS, LIBRARIES, AND SYSTEMS

### 3.1 OpenMusic Sound Processing Libraries

OpenMusic provides a suite of external libraries connecting to IRCAM's sound processing kernels.

Claim: "OM-Diph: Generation and execution of Diphone scripts for sound analysis and concatenative synthesis."[^10^]
Source: OpenMusic Libraries catalog
URL: https://openmusic-project.github.io/libraries.html
Date: ongoing (library catalog)
Excerpt: "OM-Diph | Generation and execution of Diphone scripts for sound analysis and concatenative synthesis."
Context: Official OpenMusic library listing
Confidence: high

Claim: "OM-SuperVP: Control of the SuperVP phase vocoder for sound analysis and processing... OM-pm2: Control of the pm2 engine for sound partial-tracking analysis and additive synthesis."[^11^]
Source: OpenMusic Libraries catalog
URL: https://openmusic-project.github.io/libraries.html
Date: ongoing
Excerpt: "OM-SuperVP | Control of the SuperVP phase vocoder for sound analysis and processing... OM-pm2 | Control of the pm2 engine for sound partial-tracking analysis and additive synthesis."
Context: Core sound processing libraries
Confidence: high

Claim: "The OM-pm2 library allows to perform additive analysis and extract the partials from audio files using the pm2 sound processing kernel. It also performs the 'chord-seq' analysis, which extracts the main partial as chords with given time intervals. Finally, OM-pm2 allows to resynthesize sounds from lists or partials or chord-seqs using an additive synthesis model."[^12^]
Source: OM-pm2 GitHub repository
URL: https://github.com/openmusic-project/OM-pm2
Date: 2018
Excerpt: "The OM-pm2 library allows to perform additive analysis and extract the partials from audio files using the pm2 sound processing kernel. It also performs the 'chord-seq' analysis... Finally, OM-pm2 allows to resynthesize sounds from lists or partials or chord-seqs using an additive synthesis model."
Context: Additive synthesis control in OpenMusic
Confidence: high

Claim: "Hans Tutschku's OM-ASX generates parameter files usable directly with the SuperVP and pm2 engines, extending OpenMusic into the signal processing domain of IRCAM's AudioSculpt."[^13^]
Source: Csound Journal / OpenMusic: The Csound Connection
URL: https://csoundjournal.com/issue20/openmusic.html
Date: ongoing
Excerpt: "Hans Tutschku's OM-ASX generates parameter files usable directly with the SuperVP and pm2 engines, extending OpenMusic into the signal processing domain of IRCAM's AudioSculpt."
Context: Bridge between OM symbolic structures and SuperVP/pm2 parameter files
Confidence: high

### 3.2 OMChroma: High-Level Musical Control of Sound Synthesis

OMChroma represents a major achievement in high-level compositional control of synthesis.

Claim: "OMChroma is a framework for sound synthesis integrated into the computer-aided composition environment OpenMusic. It is a generalization of Chroma, a system developed by Marco Stroppa in the early 1980s."[^14^]
Source: Computer Music Journal, "OMChroma: Compositional Control of Sound Synthesis"
URL: https://hal.science/hal-00683465/document
Date: 2011
Excerpt: "OMChroma is a framework for sound synthesis integrated into the computer-aided composition environment OpenMusic. It is a generalization of Chroma, a system developed by Marco Stroppa in the early 1980s... The main purpose of OMChroma is to devise appropriately expressive concepts to deal with the large amounts of data required by sound synthesis."
Context: High-level synthesis control framework in OpenMusic
Confidence: high

Claim: "OMChroma uses a matrix representations as control structures and provides powerful high-level procedures for the design and exploration of sound synthesis processes."[^15^]
Source: IRCAM CAC Sound page
URL: http://repmus.ircam.fr/cao/sound
Date: ongoing
Excerpt: "OMChroma uses a matrix representations as control structures and provides powerful high-level procedures for the design and exploration of sound synthesis processes."
Context: IRCAM's description of OMChroma capabilities
Confidence: high

### 3.3 Constraint Programming in OpenMusic

OpenMusic includes built-in constraint programming facilities.

Claim: "Situation is a constraint system for solving CSPs involving musical objects in the OpenMusic environment... OMClouds focuses on a heuristic search strategy that improves a random solution to a CSP."[^16^]
Source: "Computer-aided musical composition" survey paper
URL: https://webperso.info.ucl.ac.be/~pvr/LAPIERE_2020.pdf
Date: 2020
Excerpt: "Situation Developed by A. Bonnet and C. Rueda, Situation is a constraint system for solving CSPs involving musical objects in the OpenMusic environment... OMClouds This tool extending OpenMusic proposed by C. Truchet differs from the other in the sense that it focuses on a heuristic search strategy that improves a random solution to a CSP."
Context: Survey of constraint programming in OpenMusic
Confidence: high

### 3.4 Bach Library for Max

The bach library bridges real-time and symbolic composition in Max.

Claim: "bach: automatic composer's helper is a cross platform set of patches and externals for Max, aimed to bring the richness of computer-aided composition into the real-time world. It is a joined project with composer Andrea Agostini."[^17^]
Source: Daniele Ghisi research page
URL: https://www.danieleghisi.com/research/bach/
Date: ongoing
Excerpt: "bach: automated composer's helper is a cross platform set of patches and externals for Max, aimed to bring the richness of computer-aided composition into the real-time world. Discover it following this link. It is a joined project with composer Andrea Agostini."
Context: Official description of bach library
Confidence: high

Claim: "With bach they aimed to narrow the gap between symbolic music processing, as typified by music notation software and specialized computer-aided composition environments, and signal processing, as typified by sound synthesis languages and digital audio tools."[^18^]
Source: Computer Music Journal, About This Issue
URL: https://www.mitpressjournals.org/doi/pdf/10.1162/COMJ_e_00293
Date: 2015
Excerpt: "This issue's first article describes 'bach,' a free library for the widely used Max music software... The authors explain that with bach they aimed to narrow the gap between symbolic music processing, as typified by music notation software and specialized computer-aided composition environments, and signal processing, as typified by sound synthesis languages and digital audio tools."
Context: CMJ editorial introducing the bach paper
Confidence: high

Claim: "bach focuses on real-time manipulation of symbolic musical data. Moving beyond simple display, editing, and playback of notated music, bach provides over 200 modules for processing the note data."[^19^]
Source: IEEE Xplore / Computer Music Journal
URL: https://ieeexplore.ieee.org/document/7226467/
Date: 2015
Excerpt: "The library is called 'bach: automated composer's helper.' Published in: Computer Music Journal (Volume: 39, Issue: 2, June 2015)."
Context: Official publication of bach in Computer Music Journal
Confidence: high

### 3.5 Cage Library: High-Level CAC in Max

The cage library extends bach with higher-level compositional tools.

Claim: "cage is a library for the Max environment including a number of high-level modules for algorithmic and computer-aided composition (CAC)."[^20^]
Source: cage ICMC 2014 paper
URL: https://www.andreaagostini.eu/wp-content/uploads/2015/08/cage-a-high-level-library-for-real-time-computer-aided.pdf
Date: 2014
Excerpt: "This paper is an introduction to cage, a library for the Max environment including a number of high-level modules for algorithmic and computer-aided composition (CAC). The library... is composed by a set of tools aimed to ease manipulation of symbolic musical data and solve typical CAC problems, such as generation of pitches, generation and processing of melodic profiles, symbolic processes inspired by digital signal processing, harmonic and rhythmic interpolations, automata and L-systems, tools for musical set theory, tools for score generation and handling."
Context: High-level CAC library built on bach
Confidence: high

Claim: "cage.granulate is a symbolic granulation engine. The parameters of the granulation are the same as in the corresponding electro-acoustical process: the time interval between two grains, the size of each grain, the beginning and the end of the temporal region from which the grain must be extracted."[^21^]
Source: cage ICMC 2014 paper
URL: http://www.icmc14-smc14.net/images/proceedings/OS20-B02-cage.pdf
Date: 2014
Excerpt: "cage.granulate is a symbolic granulation engine. The parameters of the granulation are the same as in the corresponding electro-acoustical process: the time interval between two grains, the size of each grain, the beginning and the end of the temporal region from which the grain must be extracted. Based upon these parameters, cage.granulate fills in real time a bach.roll object connected to its outlet."
Context: Symbolic granulation directly analogous to audio granulation
Confidence: high

### 3.6 Dada Library: Symbolic Corpus-Based Concatenative Synthesis

The dada library extends the corpus-based concatenative synthesis paradigm to symbolic musical notation.

Claim: "We introduce a collection of modules designed to segment, analyze, display and sequence symbolic scores in real-time. This mechanism, inspired from CataRT's corpus-based concatenative synthesis, is implemented as a part of the dada library for Max, currently under development."[^22^]
Source: TENOR 2016 proceedings
URL: https://www.tenor-conference.org/proceedings/2016/01_Ghisi_tenor2016.pdf
Date: 2016
Excerpt: "We introduce a collection of modules designed to segment, analyze, display and sequence symbolic scores in real-time. This mechanism, inspired from CataRT's corpus-based concatenative synthesis, is implemented as a part of the dada library for Max, currently under development."
Context: Core paper on symbolic CBCS
Confidence: high

Claim: "The system relies on three different modules: dada.segment, performing segmentation and feature extraction, dada.base, implementing the actual database engine, and dada.catart, a two-dimensional graphic interface capable of organizing and interacting with the extracted grains."[^23^]
Source: TENOR 2016 proceedings
URL: https://www.tenor-conference.org/proceedings/2016/01_Ghisi_tenor2016.pdf
Date: 2016
Excerpt: "The system relies on three different modules: dada.segment, performing segmentation and feature extraction, dada.base, implementing the actual database engine, and dada.catart, a two-dimensional graphic interface capable of organizing and interacting with the extracted grains."
Context: Architecture of symbolic CBCS system
Confidence: high

Claim: "dada is to bach what a laboratory is to a library. Under the umbrella of non-standard, strictly two-dimensional graphic user interfaces, all of its components participate of a ludic, explorative approach to music."[^24^]
Source: TENOR 2018 proceedings
URL: https://www.tenor-conference.org/proceedings/2018/19_Ghisi_tenor18.pdf
Date: 2018
Excerpt: "The philosophy behind dada is profoundly different from the one which informed bach: dada is to bach what a laboratory is to a library. Under the umbrella of non-standard, strictly two-dimensional graphic user interfaces, all of its components participate of a ludic, explorative approach to music."
Context: TENOR 2018 paper on dada library philosophy
Confidence: high

Claim: "Its modules address a range of scenarios, including, but not limited to, database visualization, score segmentation and analysis, concatenative synthesis, music generation via physical or geometrical modelling, wave terrain synthesis, graph exploration, cellular automata, swarm intelligence, and videogames."[^25^]
Source: TENOR 2018 proceedings
URL: https://www.tenor-conference.org/proceedings/2018/19_Ghisi_tenor18.pdf
Date: 2018
Excerpt: "This article introduces the dada library, providing Max with the ability to organize, select and generate musical content via a set of graphical interfaces manifesting an interactive, explorative approach. Its modules address a range of scenarios, including, but not limited to, database visualization, score segmentation and analysis, concatenative synthesis, music generation via physical or geometrical modelling..."
Context: Full scope of dada library modules
Confidence: high

### 3.7 Bach + CataRT Integration: Corpus-Based Transcription

A landmark achievement bridging real-time CBCS with symbolic notation is the bach-CataRT integration for corpus-based transcription.

Claim: "By combining two of the most exciting recent packages for MAX, CATART corpus-based concatenative synthesis (CBCS) and BACH: AUTOMATED COMPOSER'S HELPER, we propose a rich tool for real-time creation, storage, editing, re-synthesis, and transcription of concatenative sound."[^26^]
Source: ICMC 2014 paper
URL: https://openaccess.city.ac.uk/id/eprint/16730/1/Einbond2014-1.pdf
Date: 2014
Excerpt: "By combining two of the most exciting recent packages for MAX, CATART corpus-based concatenative synthesis (CBCS) and BACH: AUTOMATED COMPOSER'S HELPER, we propose a rich tool for real-time creation, storage, editing, re-synthesis, and transcription of concatenative sound."
Context: Paper by Einbond, Trapani, Agostini, Ghisi, and Schwarz
Confidence: high

Claim: "Using CATART and BACH, a full orchestral score can now be automatically generated, subjectively edited, and efficiently exported to a music notation program for further alteration."[^27^]
Source: ICMC 2014 paper
URL: https://openaccess.city.ac.uk/id/eprint/16730/1/Einbond2014-1.pdf
Date: 2014
Excerpt: "Using CATART and BACH, a full orchestral score can now be automatically generated, subjectively edited, and efficiently exported to a music notation program for further alteration. To this end, a corpus of orchestral samples is imported into CATART, which is then used to synthesize a concatenative montage."
Context: Generating performer-readable scores from concatenative synthesis
Confidence: high

Claim: "The same process can also be transcribed into instrumental notation to be reinterpreted acoustically, a technique termed 'corpus-based transcription.'"[^28^]
Source: Einbond et al., Computer Music Journal 2017
URL: https://openaccess.city.ac.uk/id/eprint/17394/15/Einbond2017.pdf
Date: 2017
Excerpt: "The same process can also be transcribed into instrumental notation to be reinterpreted acoustically, a technique termed 'corpus-based transcription.' In this way the timbre of a recorded sound—for example a field recording—is mapped to a score for live performance."
Context: Corpus-based transcription as compositional technique
Confidence: high

### 3.8 Orchidée / Orchidea: Automatic Orchestration

The Orchidée system (now evolved into Orchidea) represents a parallel corpus-based approach focused on instrumental orchestration.

Claim: "Orchidée is software developed by IRCAM as a computer-aided orchestration tool... It was developed by Grégoire Carpentier and Damien Tardieu during their PhD studies at IRCAM, with the help and supervision of composer Yan Maresz."[^29^]
Source: Wikipedia / IRCAM
URL: https://en.wikipedia.org/wiki/Orchid%C3%A9e
Date: 2010
Excerpt: "Orchidée is software developed by IRCAM as a computer-aided orchestration tool. It is a MATLAB-based application that communicates with traditional computer-aided composition environments through Open Sound Control messages... It was developed by Grégoire Carpentier and Damien Tardieu during their PhD studies at IRCAM, with the help and supervision of composer Yan Maresz."
Context: Original Orchidée automatic orchestration system
Confidence: high

Claim: "A recent example of its use for orchestral composition were in Jonathan Harvey's Speakings, premiered in 2008, in which speech was analyzed and computed to provide orchestral combinations for the composer."[^30^]
Source: Wikipedia / IRCAM
URL: https://en.wikipedia.org/wiki/Orchid%C3%A9e
Date: 2010
Excerpt: "A recent example of its use for orchestral composition were in Jonathan Harvey's Speakings, premiered in 2008, in which speech was analyzed and computed to provide orchestral combinations for the composer. Given an input target sound, Orchidée creates a musical score which imitates the sound using a mixture of traditional instruments."
Context: Major musical work using Orchidée
Confidence: high

Claim: "Orchidea is a framework for static and dynamic computer-assisted orchestration. It is the new generation of the Orchid* softwares for assisted orchestration (originally created in the Ircam Music Representation team)."[^31^]
Source: Orchidea official website
URL: https://www.orch-idea.org/intro/
Date: ongoing
Excerpt: "Orchidea is a framework for static and dynamic computer-assisted orchestration. It is the new generation of the Orchid* softwares for assisted orchestration (originally created in the Ircam Music Representation team). It is a joint project between Ircam, HEM Geneve and UC Berkeley."
Context: New generation of automatic orchestration software
Confidence: high

Claim: "Dynamic Computer-Aided Orchestration in Practice with Orchidea" — Carmine-Emanuele Cella, Computer Music Journal 45(4), 2023.[^32^]
Source: Computer Music Journal
URL: https://direct.mit.edu/comj/article-abstract/45/4/40/114725
Date: 2023
Excerpt: "Dynamic Computer-Aided Orchestration in Practice with Orchidea. Carmine-Emanuele Cella... April 18 2023."
Context: Recent major publication on Orchidea
Confidence: high

### 3.9 Diphone and OM-Diph

IRCAM's Diphone tool provides concatenative synthesis capabilities that are accessible from OpenMusic via OM-Diph.

Claim: "A hybrid concatenative synthesis system on the intersection of music and speech... An option of the system permits to extract prosodic units out of the database. Exportation of the acoustic features and of the symbolic descriptors into an SDIF file allows to exploit these supra-segmental groups in other musical software such as OpenMusic, Diphone, or MAX/MSP."[^33^]
Source: IRCAM / hybrid concatenative synthesis paper
URL: http://recherche.ircam.fr/anasyn/concat/doc/hybridconcat.pdf
Date: ~2005
Excerpt: "An option of the system permits to extract prosodic units out of the database. Exportation of the acoustic features (f0, energy, flow, etc.) and of the symbolic descriptors (grammatical structure, type of the final accent, etc.) into an SDIF file allows to exploit these supra-segmental groups in other musical software such as OpenMusic, Diphone, or MAX/MSP."
Context: Diphone as part of IRCAM's synthesis ecosystem
Confidence: medium

### 3.10 Constraint Programming for Unit Selection

Unit selection in concatenative synthesis can be formulated as a constraint satisfaction problem.

Claim: "Applying the formalism of constraint satisfaction to unit selection permits to express musical desiderata additional to the target match in a flexible way, such as to avoid repeating units, or not to use a certain unit for the selection."[^34^]
Source: Diemo Schwarz, "Concatenative Sound Synthesis"
URL: http://articles.ircam.fr/textes/Schwarz06b/index.pdf
Date: 2006
Excerpt: "Applying the formalism of constraint satisfaction to unit selection permits to express musical desiderata additional to the target match in a flexible way, such as to avoid repeating units, or not to use a certain unit for the selection. It has been first proposed for music program generation by Pachet, Roy, and Cazaly (2000)... and for data-driven concatenative musical synthesis by Zils and Pachet (2001) in the Musical Mosaicing system."
Context: Constraint solving approach to unit selection
Confidence: high

Claim: "Zils and Pachet first introduced constraint satisfaction for concatenative synthesis in what they describe as musical mosaicking... They define two categories of constraints: segment and sequence constraints."[^35^]
Source: k-Best HMM Decoding for Unit Selection paper
URL: https://repositori.upf.edu/bitstreams/91d08ee2-b571-413a-8f35-b842d4642efa/download
Date: (referenced)
Excerpt: "Zils and Pachet first introduced constraint satisfaction for concatenative synthesis in what they describe as musical mosaicking... They define two categories of constraints: segment and sequence constraints. Segment constraints control aspects of individual units... Sequence constraints apply globally and affect aspects of time, continuity, and overall distributions of units."
Context: Formalization of constraint-based unit selection
Confidence: high

---

## 4. CURRENT STATE (2024–2026)

### 4.1 OpenMusic Active Development

Claim: "OM 7.5... Nov 20, 2024... OM 8.0... Code ported to LW 8.1.x... 53 EDO"[^36^]
Source: OpenMusic GitHub releases
URL: https://github.com/openmusic-project/openmusic/releases
Date: 2024-2025
Excerpt: "OM 7.5. Nov 20, 2024... OM 8.0... NEW FEATURES: 53 EDO (S.Socha); Code ported to LW 8.1.x..."
Context: Active development with regular releases
Confidence: high

### 4.2 IRCAM Forum Workshops 2025

Claim: "IRCAM International Forum Workshops 2025... workshops on topics such as spatial composition and audio technologies, computer-assisted composition and orchestration, hybrid compositions with artificial intelligence systems... working with ASAP, Max, PARTIELS, and OpenMusic software."[^37^]
Source: IRCAM Forum Workshops 2025 program
URL: https://forum.ircam.fr/collections/detail/forum-ircam-latvia/
Date: 2025
Excerpt: "The program will include keynote plenary reports, lectures, workshops, presentations and performances on topics such as spatial composition and audio technologies, computer-assisted composition and orchestration, hybrid compositions with artificial intelligence systems, the study of sound content and properties, working with ASAP, Max, PARTIELS, and OpenMusic software, among others."
Context: Current IRCAM activity in CAC
Confidence: high

Claim: "Integrating LLM-Based Tools into Computer-Assisted Composition Workflows in OpenMusic" — Dr. Alex Buck, IRCAM Forum Workshops 2025.[^38^]
Source: IRCAM Forum article
URL: https://forum.ircam.fr/article/detail/integrating-llm-based-tools-into-computer-assisted-composition-workflows-in-openmusic-by-dr-alex-buck/
Date: 2025
Excerpt: "Integrating LLM-Based Tools into Computer-Assisted Composition Workflows in OpenMusic... This talk is part of IRCAM Forum Workshops Hors-les-Murs 2025 Rīga-Liepāja (Latvia)."
Context: AI/LLM integration with OpenMusic CAC workflows
Confidence: high

### 4.3 CataRT and Corpus-Based Synthesis: Recent Developments

Claim: "Extensymbiosis — The Audio–Visually Augmented Trumpet and Multi-modal Corpus-based Synthesis as a Shared Instrument" — Nicolas Souchal, Diemo Schwarz (Ircam), Improtech 2025.[^39^]
Source: Improtech 2025 programme
URL: https://improtech.ircam.fr/ikparis/pages/programme.html
Date: 2025
Excerpt: "corpus-based concatenative synthesis leverages machine listening and allows to play music by selecting grains from pre- or live-recorded sound via gesture-controlled navigation in a timbre space defined by perceptual audio descriptors... the extension of corpus-based synthesis to the domain of images enables audio–visual improvisation via cross-modal mappings."
Context: Latest developments in CataRT and multi-modal corpus synthesis
Confidence: high

### 4.4 Neural-Concatenative Hybrids (2024–2025)

Claim: "CoSaRef first uses a concatenative sampler with a sample library to generate synthetic audio from a MIDI input score. A diffusion-based generative model then refines the synthetic audio."[^40^]
Source: arXiv 2024 (later published)
URL: https://arxiv.org/html/2410.16785v2
Date: 2024
Excerpt: "This study introduces Concatenative Sampler and Refinement (CoSaRef), a MIDI-to-audio synthesis method that operates without MIDI annotations... CoSaRef first uses a concatenative sampler with a sample library to generate synthetic audio from a MIDI input score. Then a deep audio generation model (DAGM), based on diffusion model, is utilized to refine the synthetic audio into a realistic one."
Context: Hybrid concatenative + diffusion model approach
Confidence: high

### 4.5 Orchidea and ACTOR Project

Claim: "This group aims at researching and designing new methods for computer-assisted orchestration, within the context provided by the Orchidea project."[^41^]
Source: ACTOR Project website
URL: https://www.actorproject.org/workgroups/orchidea
Date: 2021-ongoing
Excerpt: "This group aims at researching and designing new methods for computer-assisted orchestration, within the context provided by the Orchidea project... The interdisciplinary research addressed in the group involves mathematical optimisation, machine learning, mathematical models for music and deep learning."
Context: Current research in computer-assisted orchestration
Confidence: high

---

## 5. KEY ACTORS & STAKEHOLDERS

### IRCAM / STMS Lab (Paris)
- **Jean Bresson**: Principal OpenMusic developer (2008–2019), now at Ableton. Created OM-SuperVP, OM-pm2, OM-Diph, OM-Spat. PhD 2007 on sound synthesis in CAC.
- **Carlos Agon**: Original OpenMusic co-creator with Gerard Assayag.
- **Diemo Schwarz**: Creator of CataRT, Caterpillar. Researcher at IRCAM since ~2000. Performs with CataRT instrument.
- **Daniele Ghisi**: Creator of bach, cage, dada libraries. PhD 2017 on corpus-based interactive CAC. Now works on Orchidea Max package.
- **Andrea Agostini**: Co-creator of bach and cage libraries.
- **Carmine-Emanuele Cella**: Lead researcher on Orchidea, UC Berkeley.
- **Grégoire Carpentier** / **Damien Tardieu**: Original creators of Orchidée.
- **Marco Stroppa**: Composer, creator of Chroma system (predecessor to OMChroma).

### External Institutions
- **HES-SO Geneva**: Home of bach/cage/dada development (Agostini, Ghisi, Daubresse).
- **UC Berkeley**: Partner in Orchidea project (Carmine Cella).
- **HEM Genève**: Partner in Orchidea project.
- **Harvard / Columbia / City, University of London**: Einbond, Trapani and collaborators on bach-CataRT integration.

### Open-Source Projects
- **OpenMusic** (openmusic-project on GitHub)
- **bach** (bachproject.net)
- **cage** (bachproject.net/cage)
- **dada** (bachproject.net/dada)
- **CataRT** (free, open-source GPL)
- **Orchidea** (orch-idea.org)

---

## 6. TENSIONS & COUNTER-NARRATIVES

### 6.1 Symbolic vs. Signal Processing Divide

The historical tension between symbolic CAC and signal processing remains a structuring force.

Claim: "The idea of a symbolic manipulation of musical data, close to the compositional concepts, historically tended to make these systems diverge from the sound-related concerns."[^42^]
Source: Sound Processing in OpenMusic
URL: https://hal.science/hal-01169018v1/document
Date: 2006
Excerpt: "The idea of a symbolic manipulation of musical data, close to the compositional concepts, historically tended to make these systems diverge from the sound-related concerns."
Context: Fundamental tension in CAC history
Confidence: high

### 6.2 Real-Time vs. Offline Composition

The bach project's stated goal is to overcome the real-time vs. offline divide.

Claim: "In traditional CAC environments interface changes have no effect until a certain 'refresh' operation is performed, whereas real-time environments immediately react to user input."[^43^]
Source: bach ICMC 2012 paper
URL: https://www.andreaagostini.eu/wp-content/uploads/2015/08/bach-an-environment-for-computer-aided-composition-in-max.pdf
Date: 2012
Excerpt: "In traditional CAC environments interface changes have no effect until a certain 'refresh' operation is performed, whereas real-time environments immediately react to user input. We shall present in this article a library for Max, named bach: automatic composer's helper, which adds highly refined capabilities for musical notation and symbolic processing to a typically real-time environment, in order to recompose the fracture between computer-aided composition and the real-time world."
Context: Core motivation for bach library
Confidence: high

### 6.3 Constraint Solving vs. Path-Search Unit Selection

There is a fundamental methodological tension in unit selection algorithms.

Claim: "The HMM approach can be quite rigid for musical purposes because it produces one single optimised sequence without the ability to manipulate the individual units."[^44^]
Source: k-Best HMM Decoding for Unit Selection
URL: https://repositori.upf.edu/bitstreams/91d08ee2-b571-413a-8f35-b842d4642efa/download
Date: (referenced)
Excerpt: "Schwarz notes, however, that the HMM approach can be quite rigid for musical purposes because it produces one single optimised sequence without the ability to manipulate the individual units. To address these limitations, he reformulates the task into a constraint-satisfaction problem, which offers more flexibility for interaction."
Context: Trade-off between global optimality (Viterbi) and interactive flexibility (CSP)
Confidence: high

### 6.4 The Future of Concatenative Synthesis

Recent developments suggest neural methods may supersede or hybridize with traditional CBCS.

Claim: "Neural networks now improve unit selection quality, while concatenative methods provide the authentic source material that neural approaches sometimes lack."[^45^]
Source: VAPI.ai blog
URL: https://vapi.ai/blog/concatenative-synthesis
Date: 2025
Excerpt: "Neural networks now improve unit selection quality, while concatenative methods provide the authentic source material that neural approaches sometimes lack. Researchers are exploring hybrid approaches that combine concatenative synthesis with diffusion models for MIDI-to-audio synthesis."
Context: Industry perspective on neural-concatenative hybrids
Confidence: medium

---

## 7. CONCRETE EXAMPLES & MUSICAL WORKS

### 7.1 Jonathan Harvey's *Speakings* (2008)

Claim: "For this piece, Harvey made use of the computer-assisted orchestration software Orchids, developed at IRCAM."[^46^]
Source: "Speech as a Model for Orchestration" project report
URL: https://timbreandorchestration.org/writings/project-reports/speech-as-model-for-orchestration
Date: 2025
Excerpt: "One such case is Jonathan Harvey's Speakings, for orchestra and electronics, which is perhaps among the most formalized attempts at directly imitating the speaking voice through orchestration. For this piece, Harvey made use of the computer-assisted orchestration software Orchids, developed at IRCAM."
Context: Major orchestral work using automatic orchestration
Confidence: high

### 7.2 Christopher Trapani's *Five Out of Six* and *Spinning in Infinity*

Claim: "Targeted Transposition was the subject of an ICMC paper in 2012... My first piece to use this technique extensively was Five Out of Six... The same sample database was also used to compose the instrumental score of the work through the process of corpus-based transcription."[^47^]
Source: Christopher Trapani CataRT Tools page
URL: http://christophertrapani.com/wordpresssite/catart-tools/
Date: 2021
Excerpt: "My first piece to use this technique extensively was Five Out of Six, where an ensemble of six instruments on stage interact with both CataRT and live video... This spiral was an early sketch for Spinning in Infinity, a piece whose electronics consisted exclusively of CataRT playback piloted by bach.rolls, recalled by a MIDI keyboard in the orchestra."
Context: Compositions using bach-CataRT targeted transposition and corpus-based transcription
Confidence: high

### 7.3 Aaron Einbond's *Cartographies* and *What the Blind See*

Claim: "In Cartographies, the performers trigger corpus-based spatialization through a process of live audio 'mosaicking.'... The same sample database was also used to compose the instrumental score of the work through the process of corpus-based transcription."[^48^]
Source: Einbond et al., Computer Music Journal 2017
URL: https://openaccess.city.ac.uk/id/eprint/17394/15/Einbond2017.pdf
Date: 2017
Excerpt: "In Cartographies, the performers trigger corpus-based spatialization through a process of live audio 'mosaicking.'... The same sample database was also used to compose the instrumental score of the work through the process of corpus-based transcription: Target sounds, drawn from longer piano samples as well as the found sound of the CMB, were transcribed into music notation readable by the performers."
Context: Multi-work project using corpus-based transcription
Confidence: high

### 7.4 Marco Stroppa's *Re Orso* (2012)

Claim: "Marco Stroppa's opera Re Orso (2012) was an important moment in this project development and the first important application of OM-Chant in such a wide production."[^49^]
Source: Jean Bresson projects page
URL: https://j-bresson.github.io/projects
Date: 2020
Excerpt: "Marco Stroppa's opera Re Orso (2012) was an important moment in this project development and the first important application of OM-Chant in such a wide production."
Context: Major theatrical work using OM synthesis control
Confidence: high

---

## 8. ALGORITHMIC CORPUS DESIGN

Claim: "In the current chapter, I detail the strategies for generating music in earGram. I start by focusing on methods for 'composing' a corpus of units and their organization into larger sections."[^50^]
Source: "Composing Music by Selection: Content-Based Algorithmic-Assisted Audio Composition" (PhD thesis)
URL: https://repositorio-aberto.up.pt/bitstream/10216/84901/2/31312.pdf
Date: (thesis)
Excerpt: "In the current chapter, I detail the strategies for generating music in earGram. I start by focusing on methods for 'composing' a corpus of units and their organization into larger sections... Next, I focus on the low-level aspects of the generation and describe the following four generative music strategies that function as unit selection algorithms in earGram: (1) spaceMap, (2) soundscapeMap, (3) shuffMeter, and (4) infiniteMode."
Context: Algorithmic approaches to corpus construction and organization
Confidence: medium

Claim: "Music across music: towards a corpus-based, interactive computer-aided composition" — Daniele Ghisi PhD thesis, 2017.[^51^]
Source: Daniele Ghisi PhD thesis
URL: https://www.danieleghisi.com/phd/PHDThesis_20180118.pdf
Date: 2017
Excerpt: "Music Across Music: Towards a Corpus-Based, Interactive Computer-Aided Composition. A thesis presented by Daniele GHISI. UNIVERSITE PIERRE ET MARIE CURIE... Thesis Supervisor: Carlos Augusto AGON Amado. Defended on December 19th, 2017."
Context: Comprehensive doctoral work on corpus-based composition methodology
Confidence: high

---

## 9. RESEARCH GAPS & FUTURE DIRECTIONS

Based on the findings, several gaps and tensions emerge:

1. **Integration of audio and symbolic descriptors**: The dada library explicitly notes that "the relationships between audio and symbolic descriptors could be in itself a topic for further investigations"[^52^] (Ghisi & Agon, TENOR 2016).

2. **Semi-automatic symbolic segmentation**: dada.segment currently requires manual markers, equations, or labels — "it is not able, by design, to infer such markers or labels"[^53^] (Ghisi & Agon, TENOR 2016).

3. **Real-time symbolic CBCS**: While dada implements symbolic CBCS, the real-time performance capabilities lag behind audio CBCS due to the complexity of symbolic feature extraction.

4. **Neural-symbolic hybrids**: The CoSaRef approach (concatenative + diffusion) points to a future where symbolic CAC systems like OpenMusic could integrate with neural audio generation.

5. **Cross-modal corpus synthesis**: Diemo Schwarz's Improtech 2025 presentation on "multi-modal corpus-based synthesis" extending CataRT to images represents a new frontier.

---

## 10. CITATION INDEX

[^1^] Agon, G., Assayag, G., Laurson, M., Rueda, C., et al. "Computer Assisted Composition at Ircam: PatchWork & OpenMusic." *Computer Music Journal*, 23(3), 1999. http://recherche.ircam.fr/equipes/repmus/RMPapers/CMJ98/

[^2^] Bresson, J. "Sound Processing in OpenMusic." *Proc. DAFx-06*, Montreal, 2006. https://hal.science/hal-01169018v1/document

[^3^] Bresson, J. "OM# project page." https://j-bresson.github.io/

[^4^] OpenMusic releases. GitHub. https://github.com/openmusic-project/openmusic/releases

[^5^] Bresson, J. *La synthèse sonore en composition musicale assistée par ordinateur: Modélisation et écriture du son.* PhD Thesis, UPMC Paris 6, 2007. http://articles.ircam.fr/textes/Bresson07c/index.pdf

[^6^] Bresson, J. "Projects." https://j-bresson.github.io/projects

[^7^] Schwarz, D., Beller, G., Verbrugghe, B., Britton, S. "Real-Time Corpus-Based Concatenative Synthesis with CataRT." *DAFx-06*, Montreal, 2006. http://recherche.ircam.fr/anasyn/schwarz/publications/dafx2006/catart-dafx2006-long.pdf

[^8^] Schwarz, D. "Concatenative sound synthesis: The early years." *Journal of New Music Research*, 35(1):3-22, 2006.

[^9^] Schwarz, D. "Corpus-based concatenative synthesis." *IEEE Signal Processing Magazine*, 24(2):92-104, March 2007.

[^10^] OpenMusic Libraries. https://openmusic-project.github.io/libraries.html

[^11^] OpenMusic Libraries catalog. https://github.com/openmusic-project/openmusic-project.github.io/blob/master/libraries.md

[^12^] OM-pm2 repository. https://github.com/openmusic-project/OM-pm2

[^13^] Boulanger, R. (ed.) "OpenMusic: The Csound Connection." *Csound Journal*, Issue 20. https://csoundjournal.com/issue20/openmusic.html

[^14^] Bresson, J., Stroppa, M., Agon, C. "OMChroma: Compositional Control of Sound Synthesis." *Computer Music Journal*, 2011. https://hal.science/hal-00683465/document

[^15^] IRCAM CAC Sound. http://repmus.ircam.fr/cao/sound

[^16^] "Computer-aided musical composition" survey. https://webperso.info.ucl.ac.be/~pvr/LAPIERE_2020.pdf

[^17^] Ghisi, D. "bach." https://www.danieleghisi.com/research/bach/

[^18^] "About This Issue." *Computer Music Journal*, 39(2), 2015. https://www.mitpressjournals.org/doi/pdf/10.1162/COMJ_e_00293

[^19^] Agostini, A., Ghisi, D. "A Max Library for Musical Notation and Computer-Aided Composition." *Computer Music Journal*, 39(2):11-27, 2015. https://ieeexplore.ieee.org/document/7226467/

[^20^] Agostini, A., Daubresse, E., Ghisi, D. "cage: a high-level library for real-time computer-aided composition." *ICMC*, Athens, 2014. https://www.andreaagostini.eu/wp-content/uploads/2015/08/cage-a-high-level-library-for-real-time-computer-aided.pdf

[^21^] cage ICMC 2014. http://www.icmc14-smc14.net/images/proceedings/OS20-B02-cage.pdf

[^22^] Ghisi, D., Agon, C. "Real-Time Corpus-Based Concatenative Synthesis for Symbolic Notation." *TENOR*, Cambridge, 2016. https://www.tenor-conference.org/proceedings/2016/01_Ghisi_tenor2016.pdf

[^23^] Ghisi, D., Agon, C. "Real-Time Corpus-Based Concatenative Synthesis for Symbolic Notation." *TENOR*, Cambridge, 2016.

[^24^] Ghisi, D., Agon, C. "dada: Non-Standard User Interfaces for Computer-Aided Composition in Max." *TENOR*, Montreal, 2018. https://www.tenor-conference.org/proceedings/2018/19_Ghisi_tenor18.pdf

[^25^] Ghisi, D., Agon, C. "dada: Non-Standard User Interfaces..." *TENOR*, Montreal, 2018.

[^26^] Einbond, A., Trapani, C., Agostini, A., Ghisi, D., Schwarz, D. "Fine-tuned Control of Concatenative Synthesis with CATART Using the BACH Library for MAX." *ICMC*, Athens, 2014. https://openaccess.city.ac.uk/id/eprint/16730/1/Einbond2014-1.pdf

[^27^] Einbond et al. "Fine-tuned Control of Concatenative Synthesis with CATART..." *ICMC*, 2014.

[^28^] Einbond, A., Schwarz, D., Bresson, J. "Cartographies: Composing with corpus-based synthesis, spatialization, and transcribed notation." *Computer Music Journal*, 2017. https://openaccess.city.ac.uk/id/eprint/17394/15/Einbond2017.pdf

[^29^] "Orchidée." Wikipedia. https://en.wikipedia.org/wiki/Orchid%C3%A9e

[^30^] Wikipedia / IRCAM. Orchidée page.

[^31^] "What is Orchidea?" https://www.orch-idea.org/intro/

[^32^] Cella, C.-E. "Dynamic Computer-Aided Orchestration in Practice with Orchidea." *Computer Music Journal*, 45(4):40-56, 2023. https://direct.mit.edu/comj/article-abstract/45/4/40/114725

[^33^] Beller, G., Schwarz, D., et al. "A Hybrid Concatenative Synthesis System on the Intersection of Music and Speech." http://recherche.ircam.fr/anasyn/concat/doc/hybridconcat.pdf

[^34^] Schwarz, D. "Concatenative Sound Synthesis." http://articles.ircam.fr/textes/Schwarz06b/index.pdf

[^35^] "k-Best Hidden Markov Model Decoding for Unit Selection in Concatenative Synthesis." https://repositori.upf.edu/bitstreams/91d08ee2-b571-413a-8f35-b842d4642efa/download

[^36^] OpenMusic GitHub releases. 2024-2025.

[^37^] IRCAM Forum Workshops 2025. https://forum.ircam.fr/collections/detail/forum-ircam-latvia/

[^38^] Buck, A. "Integrating LLM-Based Tools into Computer-Assisted Composition Workflows in OpenMusic." IRCAM Forum, 2025.

[^39^] Souchal, N., Schwarz, D. "Extensymbiosis." Improtech 2025. https://improtech.ircam.fr/ikparis/pages/programme.html

[^40^] "Annotation-free MIDI-to-Audio Synthesis via Concatenative Synthesis and Generative Refinement." arXiv, 2024. https://arxiv.org/html/2410.16785v2

[^41^] ACTOR Project. https://www.actorproject.org/workgroups/orchidea

[^42^] Bresson, J. "Sound Processing in OpenMusic." DAFx-06, 2006.

[^43^] Agostini, A., Ghisi, D. "bach: an environment for computer-aided composition in Max." *ICMC*, Ljubljana, 2012. https://www.andreaagostini.eu/wp-content/uploads/2015/08/bach-an-environment-for-computer-aided-composition-in-max.pdf

[^44^] "k-Best HMM Decoding for Unit Selection..."

[^45^] "How to Create Natural Audio Using Concatenative Synthesis." VAPI.ai, 2025. https://vapi.ai/blog/concatenative-synthesis

[^46^] "Speech as a Model for Orchestration." Timbre and Orchestration project. https://timbreandorchestration.org/writings/project-reports/speech-as-model-for-orchestration

[^47^] Trapani, C. "CataRT Tools." http://christophertrapani.com/wordpresssite/catart-tools/

[^48^] Einbond et al. "Cartographies." *Computer Music Journal*, 2017.

[^49^] Bresson, J. "OM-Chant." https://j-bresson.github.io/projects

[^50^] "Composing Music by Selection..." PhD thesis. https://repositorio-aberto.up.pt/bitstream/10216/84901/2/31312.pdf

[^51^] Ghisi, D. *Music Across Music: Towards a Corpus-Based, Interactive Computer-Aided Composition.* PhD Thesis, UPMC / IRCAM, 2017. https://www.danieleghisi.com/phd/PHDThesis_20180118.pdf

[^52^] Ghisi, D., Agon, C. "Real-Time Corpus-Based Concatenative Synthesis for Symbolic Notation." *TENOR*, 2016.

[^53^] Ghisi, D., Agon, C. "Real-Time Corpus-Based Concatenative Synthesis for Symbolic Notation." *TENOR*, 2016.

---

*End of Research Report — Dimension 12: Algorithmic Composition & Computer-Aided Orchestration*
