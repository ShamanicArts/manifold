# Dimension 03: Unit Selection Algorithms & Search Strategies

## Deep Research Report — Concatenative Synthesis: Algorithmic Core

**Research Date**: April 2026
**Scope**: Nearest-neighbor search in descriptor space, dynamic programming (Viterbi), constraint satisfaction, Factor Oracle / suffix automata, Variable Markov Models, efficient search structures (kd-trees, PCA branch-and-bound, vector databases), real-time constraints, and sequence optimization vs. single-unit selection.

---

## 1. The Foundational Framework: Hunt & Black Unit Selection

### 1.1 The Seminal Paper (1996)

The algorithmic foundation of modern concatenative synthesis was laid by Andrew J. Hunt and Alan W. Black in their 1996 ICASSP paper, which introduced the now-standard dual-cost framework for unit selection in speech synthesis.

Claim: "The units in a synthesis database can be treated as states in a state transition network with the state occupancy costs given by the target cost, and the state transition costs given by concatenation cost which is an estimate of the quality of concatenation of pairs of units. Given the two costs, the network can be decoded using a Viterbi algorithm."[^1^]
Source: Hunt & Black, ICASSP 1996
URL: https://www.ee.columbia.edu/~dpwe/e6820/papers/HuntB96-speechsynth.pdf
Date: 1996
Excerpt: "The units in a synthesis database can be considered as a state transition network in which the state compared cost is the distance between a database unit and a target, and the transition cost is an estimate of the quality of concatenation of two consecutive units. This framework has many similarities to HMM-based speech recognition. A pruned Viterbi search is used to select the best units for synthesis from the database."
Context: The CHATR speech synthesis system at ATR Interpreting Telecommunications Research Labs
Confidence: high

Claim: "The target cost is calculated as the weighted sum of the differences between the elements of the target and candidate feature vectors... In the current implementations p varies between 20 and 30."[^2^]
Source: Hunt & Black, ICASSP 1996
URL: https://www.ee.columbia.edu/~dpwe/e6820/papers/HuntB96-speechsynth.pdf
Date: 1996
Excerpt: "The target cost is calculated as the weighted sum of the differences between the elements of the target and candidate feature vectors: these differences are the p target sub-costs, C_j^t(t_i, u_i) (j=1,...,p). In the current implementations p varies between 20 and 30."
Context: Description of the target cost as a weighted sum of phonetic, prosodic, and contextual feature distances
Confidence: high

Claim: "Concatenation cost C^c(u_{i-1}, u_i) uses three sub-costs: cepstral distance at the point of concatenation and the absolute differences in log power and pitch. As a special case, if u_{i-1} and u_i are consecutive units in the synthesis database, their concatenation cost is zero."[^3^]
Source: Hunt & Black, ICASSP 1996
URL: https://www.ee.columbia.edu/~dpwe/e6820/papers/HuntB96-speechsynth.pdf
Date: 1996
Excerpt: "These sub-costs were used in the current work (i.e. q=3): cepstral distance at the point of concatenation and the absolute differences in log power and pitch... As a special case, if u_{i-1} and u_i are consecutive units in the synthesis database, then their concatenation is natural and therefore has a cost of zero."
Context: The zero-cost condition for consecutive units encourages "non-uniform unit selection" — selecting multi-phone sequences when available
Confidence: high

### 1.2 Training the Cost Functions

Hunt and Black presented two methods for training the cost weights: weight space search and regression training. The regression method proved substantially more efficient:

Claim: "Regression training is more effective because of its substantially lower computational requirements and greater flexibility... training time is reduced by as much as one hundred times."[^4^]
Source: Hunt & Black, ICASSP 1996
URL: https://www.ee.columbia.edu/~dpwe/e6820/papers/HuntB96-speechsynth.pdf
Date: 1996
Excerpt: "Although there is little difference in the quality of output using the two training methods, the regression training method is more effective because of its substantially lower computational requirements and greater flexibility."
Context: Comparison of weight-space search vs. regression training for target cost weights
Confidence: high

### 1.3 Pruning and Real-Time Constraints in Speech

Even in speech synthesis, the Viterbi approach required aggressive pruning for real-time performance:

Claim: "With a beam width of 10-20 units, the search can be performed in near real-time on a database with around 100,000 units... Pruning appears to have little effect on the output quality."[^5^]
Source: Hunt & Black, ICASSP 1996
URL: https://www.ee.columbia.edu/~dpwe/e6820/papers/HuntB96-speechsynth.pdf
Date: 1996
Excerpt: "With a beam width of 10-20 units, the search can be performed in near real-time on a database with around 100,000 units (on a Sun SPARC-Station 20). Synthesis is faster than real time for smaller database (less than 5,000 units). Pruning appears to have little effect on the output quality."
Context: Implementation details of pruned Viterbi search for speech synthesis
Confidence: high

---

## 2. Dynamic Programming and Viterbi in Musical Concatenative Synthesis

### 2.1 Schwarz's Caterpillar System (2000–2004)

Diemo Schwarz at IRCAM was the first to systematically adapt the Hunt & Black framework to musical sound synthesis.

Claim: "Caterpillar performs non real-time data-driven concatenative musical sound synthesis from large heterogeneous sound databases... The unit selection algorithm is a Viterbi path-search algorithm, which finds the globally optimal sequence of database units."[^6^]
Source: Schwarz, DAFX 2003 / PhD Thesis 2004
URL: http://articles.ircam.fr/textes/Schwarz00b/ / http://recherche.ircam.fr/anasyn/schwarz/thesis/report.pdf
Date: 2003/2004
Excerpt: "The unit selection algorithm is a Viterbi path-search algorithm, which finds the globally optimal sequence of database units that best match the given target units using two cost functions: The target cost expresses the similarity of a target unit to the database units by weighted Euclidean distance, including a context around the target. The concatenation cost predicts the quality of the join of two database units by join-point continuity of selected descriptors."
Context: First major musical adaptation of the Hunt & Black framework
Confidence: high

Claim: "The Caterpillar system currently uses a weighted Euclidean distance function on the feature values, normalized by division by the standard deviation."[^7^]
Source: Schwarz, DAFX 2000
URL: http://articles.ircam.fr/textes/Schwarz00b/
Date: 2000
Excerpt: "The Caterpillar system currently uses a weighted Euclidean distance function on the feature values, normalized by division by the standard deviation."
Context: Distance metric used for target cost in Caterpillar
Confidence: high

Claim: "Two unit selection algorithms were developed and compared: One uses the classic Viterbi path-search method; the other formulates selection as a constraint resolution problem."[^8^]
Source: Schwarz, PhD Thesis 2004
URL: http://recherche.ircam.fr/anasyn/schwarz/thesis/report.pdf
Date: 2004
Excerpt: "Deux algorithmes de selection d'unites ont ete developpes et compares: L'un utilise la methode classique de recherche du meilleur chemin a travers un reseaux d'etats par l'algorithme de Viterbi, l'autre formule la selection comme un probleme de resolution de contraintes."
Context: Schwarz's thesis explicitly compared Viterbi vs. constraint satisfaction approaches
Confidence: high

### 2.2 K-Best HMM Decoding for Unit Selection

Claim: "Unit selection can be represented as a fully connected trellis where each edge to a node has a basic cost of the given node to be chosen (the target cost) and an additional cost depending on the previous unit (the concatenation cost). Given the trellis, the optimal selection can be carried out with Viterbi search."[^9^]
Source: Aalto University Speech Processing Book / Rabiner & Schafer 2007
URL: https://speechprocessingbook.aalto.fi/Synthesis/Concatenative_speech_synthesis.html
Date: N/A (textbook)
Excerpt: "The selection process can be represented as a fully connected trellis... Given the trellis, the optimal selection can be carried out with Viterbi search—a dynamic programming algorithm that calculates the least cost path through the trellis. To make the search computationally feasible for large databases, less likely candidates for each target can be pruned from the trellis."
Context: Standard textbook treatment of unit selection as a trellis/Viterbi problem
Confidence: high

---

## 3. From Global Optimization to Real-Time Greedy Selection: CataRT

### 3.1 The Real-Time Compromise

CataRT (2005/2006) marked a critical architectural shift: abandoning global Viterbi optimization in favor of real-time interactive performance.

Claim: "Because of the real-time orientation of CataRT, we cannot use the globally optimal path-search style unit selection based on a Viterbi algorithm as in Caterpillar, neither do we consider concatenation quality, for the moment."[^10^]
Source: Schwarz et al., DAFX 2006
URL: https://www.dafx.de/paper-archive/2006/papers/p_279.pdf
Date: 2006
Excerpt: "Because of the real-time orientation of CataRT, we cannot use the globally optimal path-search style unit selection based on a Viterbi algorithm as in Caterpillar, neither do we consider concatenation quality, for the moment. Instead, the selection is based on finding the units closest to the current position x in the descriptor space, in a geometric sense."
Context: Key architectural decision in CataRT: trading global optimality for real-time interactivity
Confidence: high

### 3.2 Mahalanobis Distance in Descriptor Space

Claim: "The generic distance measure is a Euclidean distance on the two chosen descriptors, normalised over the corpus, i.e. a Mahalanobis distance, in order to avoid distortions between different distances because of the different ranges of the values."[^11^]
Source: Schwarz et al., DAFX 2006 / JIM 2008
URL: https://www.dafx.de/paper-archive/2006/papers/p_279.pdf / http://jim.afim-asso.org/jim08/upload/05_Schwarz_catart-jim2008-final.pdf
Date: 2006/2008
Excerpt: "The selection is considering closeness in a geometric sense, i.e. on appropriately scaled dimensions: The generic distance measure is a Euclidean distance on the two chosen descriptors, normalised over the corpus, i.e. a Mahalanobis distance."
Context: CataRT's normalization approach to handle descriptors with different value ranges
Confidence: high

Claim: "The square Mahalanobis distance d between x and all units is calculated as d = (x-μ)^2 / σ where μ is the matrix of unit data and σ the standard deviation of each descriptor over the corpus. Either the unit with minimal d is selected, or one randomly chosen from the set of units with d < r^2."[^12^]
Source: Schwarz et al., DAFX 2006
URL: https://www.dafx.de/paper-archive/2006/papers/p_279.pdf
Date: 2006
Excerpt: "A straightforward way of achieving this is to calculate the square Mahalanobis distance d between x and all units with d=(x-μ)^2/σ where μ is the (N,D) matrix of unit data and σ the standard deviation of each descriptor over the corpus. Either the unit with minimal d is selected, or one randomly chosen from the set of units with d < r^2."
Context: Exact formulation of distance calculation in CataRT
Confidence: high

### 3.3 PCA-Based Branch-and-Bound kd-Tree Search

Claim: "To improve the efficiency of selection, the units in the descriptor space are indexed by an optimised multi-dimensional k-nearest neighbour index. The algorithm constructs a search tree by splitting up the descriptor space along the hyperplane perpendicular to the principal component vector, achieving maximal separation of units."[^13^]
Source: Schwarz et al., DAFX 2006
URL: https://www.dafx.de/paper-archive/2006/papers/p_279.pdf
Date: 2006
Excerpt: "The algorithm described in [23] constructs a search tree by splitting up the descriptor space along the hyperplane perpendicular to the principal component vector, and thus achieving a maximal separation of units. This is then repeated for each sub-space until only a few units are left in each leaf node of the resulting tree. The k-nearest neighbour search can then, at each step down the tree, eliminate approximately half of the units, by just one distance calculation with the subspace boundary."
Context: CataRT's search acceleration using PCA-aligned kd-trees — a key innovation for real-time performance
Confidence: high

---

## 4. Distance Mapping: Beyond Simple Proximity

### 4.1 Extending the Distance Function

Claim: "Distance mapping by a warping function integrates additional criteria in the distance calculation while still keeping efficient selection methods based on kD-trees and branch and bound search applicable, with only little loss of efficiency."[^14^]
Source: Schwarz, SMC 2011
URL: http://articles.ircam.fr/textes/Schwarz11a/index.pdf
Date: 2011
Excerpt: "Our formulation of distance mapping by a warping function integrates these criteria in the distance calculation while still keeping efficient selection methods based on kD-trees and branch and bound search applicable, with only little loss of efficiency. The functional formulation of the constraints means that different distance mapping functions could be interpolated to smoothly crossfade from one solution space to another."
Context: Extension allowing musical constraints (avoiding repetition, favoring specific corpora) while preserving kd-tree efficiency
Confidence: high

---

## 5. Scalability: Accelerating Search in Large Corpora

### 5.1 Scalability in Content-Based Navigation

Claim: "Three scalable algorithms are crucial for scalability to large databases: Fast similarity-based search by a kD-tree in the high-dimensional descriptor space, a mass-spring model for layout, and efficient dimensionality reduction for visualisation by hybrid multi-dimensional scaling."[^15^]
Source: Schwarz, Schnell & Gulluni, ICMC 2009
URL: http://articles.ircam.fr/textes/Schwarz09b/index.pdf
Date: 2009
Excerpt: "It is based on three scalable algorithms and novel concepts for efficient visualisation and interaction: Fast similarity-based search by a kD-tree in the high-dimensional descriptor space, a mass-spring model for layout, efficient dimensionality reduction for visualisation by hybrid multi-dimensional scaling, and novel modes for interaction in a 2D representation of the descriptor space."
Context: Sound search application scaling to large databases with tens of thousands of sounds
Confidence: high

### 5.2 Filter-and-Refine Methods for Millions of Tracks

Claim: "We present a filter-and-refine method to speed up nearest neighbor searches with the Kullback-Leibler divergence for multivariate Gaussians... The search for similar music pieces is accelerated by a factor of 10-30 compared to a linear scan but still offers high recall values of 95-99%."[^16^]
Source: Schnitzer, Flexer & Widmer, ISMIR 2009
URL: https://ismir2009.ismir.net/proceedings/OS6-3.pdf
Date: 2009
Excerpt: "We present a filter-and-refine method to speed up acoustic audio similarity queries which use the Kullback-Leibler divergence as similarity measure. The proposed method rescales the divergence and uses a modified FastMap implementation to accelerate nearest-neighbor queries."
Context: Large-scale music recommendation using Gaussian timbre models with accelerated NN search
Confidence: high

Claim: "Roy et al. present a music recommendation system which uses a Monte-Carlo approximation of the Kullback-Leibler (KL) divergence as similarity measure... To speed up a similarity query, they narrow the number of nearest neighbor candidates by incrementally increasing the accuracy of the Monte-Carlo approximation."[^17^]
Source: Schnitzer, Flexer & Widmer, ISMIR 2009 (citing Roy et al.)
URL: https://ismir2009.ismir.net/proceedings/OS6-3.pdf
Date: 2009
Excerpt: "Roy et al. [9] present a music recommendation system which uses a Monte-Carlo approximation of the Kullback-Leibler (KL) divergence as similarity measure. The Monte-Carlo approximation of the KL divergence is far more expensive to compute and less accurate than the closed form... To speed up a similarity query, they narrow the number of nearest neighbor candidates by incrementally increasing the accuracy of the Monte-Carlo approximation."
Context: Prior art on approximate NN search for audio similarity — the "Roy et al." referenced in Phase 1 context
Confidence: medium (secondary citation)

---

## 6. Constraint Satisfaction Approaches

### 6.1 Musical Mosaics (Zils & Pachet, 2001)

Claim: "In Zils and Pachet (2001), we introduced the concept of musical mosaics ('Musaicing'), and the idea of using CSP to generate audio sequences of sound samples, with high-level constraints holding on the metadata of the samples."[^18^]
Source: Aucouturier & Pachet, ISMIR 2005 (citing Zils & Pachet, DAFx 2001)
URL: https://www.francoispachet.fr/wp-content/uploads/2021/01/aucouturier-05c.pdf
Date: 2005 (citing 2001)
Excerpt: "In Zils and Pachet (2001), we introduced the concept of musical mosaics ('Musaicing'), and the idea of using CSP to generate audio sequences of sound samples, with high-level constraints holding on the metadata of the samples."
Context: First application of constraint satisfaction programming to concatenative music synthesis
Confidence: high

### 6.2 Constraint Satisfaction as Unit Selection

Claim: "Applying the formalism of constraint satisfaction to unit selection permits to express musical desiderata additional to the target match in a flexible way, such as to avoid repeating units, or not to use a certain unit for the selection."[^19^]
Source: Schwarz, "Concatenative Sound Synthesis: The Early Years" (JNMR 2006)
URL: https://hal.science/hal-01161361v1/document
Date: 2006
Excerpt: "Applying the formalism of constraint satisfaction to unit selection permits to express musical desiderata additional to the target match in a flexible way, such as to avoid repeating units, or not to use a certain unit for the selection. It is based on the adaptive local search algorithm described in detail in (Codognet & Diaz, 2001; Truchet, Assayag, & Codognet, 2001), which runs iteratively until a satisfactory result is achieved."
Context: Constraint satisfaction provides declarative expression of musical constraints beyond target matching
Confidence: high

### 6.3 Ringomatic: Real-Time Constraint Satisfaction

Claim: "Ringomatic: A real-time interactive drummer using constraint-satisfaction and drum sound descriptors... A constraint-satisfaction mechanism, based on local search, selects audio segments that best match those constraints at any time."[^20^]
Source: Aucouturier & Pachet, ISMIR 2005
URL: https://www.francoispachet.fr/wp-content/uploads/2021/01/aucouturier-05a.pdf
Date: 2005
Excerpt: "A constraint-satisfaction mechanism, based on local search, selects audio segments that best match those constraints at any time. We describe the real-time aspects of the system, notably the asynchronous adding/removing of constraints, and report on several constraints and controllers designed for the system."
Context: First demonstration of real-time interactive constraint satisfaction for drum sound selection
Confidence: high

Claim: "Constraint satisfaction programming (CSP) is a paradigm for solving difficult combinatorial problems... There have been numerous applications of CSP to music, e.g. for automatic generation of playlists, automatic harmonization and spatialization."[^21^]
Source: Aucouturier & Pachet, ISMIR 2005
URL: https://www.francoispachet.fr/wp-content/uploads/2021/01/aucouturier-05a.pdf
Date: 2005
Excerpt: "Constraint satisfaction programming (CSP) finally is a paradigm for solving difficult combinatorial problems, particularly in the finite domain... There have been numerous applications of CSP to music, e.g. for automatic generation of playlists of music titles (Aucouturier and Pachet, 2002), automatic harmonization (Pachet and Roy, 2001) and spatialization (Pachet and Delerue, 2000)."
Context: Broader context of CSP applications in music, including Pachet & Roy's work on harmonization
Confidence: high

### 6.4 Pachet, Roy & Cazaly: Combinatorial Music Selection

Claim: "Pachet, Roy and Cazaly first introduced the Automatic Playlist Generation problem and proposed a combinatorial approach based on computing coherent sequences of music... A constraint solver computes the solution by a complete search."[^22^]
Source: Generating Playback Sequences of Songs With Constraint Satisfaction (MA thesis, citing Pachet et al. 2000)
URL: https://www.diva-portal.org/smash/get/diva2:1458891/FULLTEXT01.pdf
Date: N/A (citing 2000)
Excerpt: "Pachet, Roy and Cazaly first introduced the Automatic Playlist Generation problem in [3] and proposed a combinatorial approach based on computing coherent sequences of music. The objective was that the generated playlists would match user preferences, introduce users to new music and optimally exploit the catalogue."
Context: Pierre Roy's foundational work with Pachet on constraint-based music sequence generation
Confidence: high

---

## 7. Factor Oracle and Suffix Automata for Pattern Matching

### 7.1 The Factor Oracle Algorithm

Claim: "A factor oracle is a finite-state automaton that can efficiently search for factors (substrings) in a body of text... Factor oracles can be constructed in linear time and space in an incremental fashion."[^23^]
Source: Wikipedia / Allauzen, Crochemore & Raffinot 1999
URL: https://en.wikipedia.org/wiki/Factor_oracle
Date: 1999 (original)
Excerpt: "A factor oracle is a finite-state automaton that can efficiently search for factors (substrings) in a body of text. Older techniques, such as suffix trees, were time-efficient but required significant amounts of memory. Factor oracles, by contrast, can be constructed in linear time and space in an incremental fashion."
Context: The data structure that underlies musical applications of Factor Oracle
Confidence: high

### 7.2 Factor Oracle in Music (IRCAM)

Claim: "We have shown the musical potentialities of the factor oracle, a clever data structure that had been mostly demonstrated on textual and biological pattern detection... Implementations of the factor oracle and its extensions have been written in the OpenMusic environment and tested for a great variety of musical styles."[^24^]
Source: Assayag, Dubnov & others, "Using Factor Oracles for Machine Improvisation"
URL: https://hal.science/hal-01161221v1/document
Date: 2005 (published 2015 on HAL)
Excerpt: "We have shown the musical potentialities of the factor oracle, a clever data structure that had been mostly demonstrated on textual and biological pattern detection, and we have described the extensions necessary to fit with actual musical situations."
Context: First systematic application of Factor Oracle to computer music at IRCAM
Confidence: high

Claim: "An interesting improvement would be to learn harmonic intervals instead of absolute harmonic labels... experiments have shown that it was fruitful to turn the suffix links into backward and forward links, by adding reversed arrows, otherwise the model tends sometimes to get stuck into some region of the automaton."[^25^]
Source: Assayag et al., HAL 2015
URL: https://hal.science/hal-01161221v1/document
Date: 2005/2015
Excerpt: "experiments have shown that it was fruitful to turn the suffix links into backward and forward links, by adding reversed arrows, otherwise the model tends sometimes to get stuck into some region of the automaton."
Context: Practical modifications needed for Factor Oracle in musical contexts
Confidence: high

### 7.3 CatOracle: Integrating Factor Oracle with CataRT

Claim: "The approach presented here draws on some of the most versatile existing tools for realtime interaction: CATART for CBCS and the OMAX/PYORACLE for computer-assisted improvisation... CATORACLE would be implemented with the MUBU library for MAX and PYORACLE."[^26^]
Source: CatOracle paper
URL: https://hal.science/hal-01427364/document
Date: N/A
Excerpt: "The approach presented here draws on some of the most versatile existing tools for realtime interaction: CATART for CBCS and the OMAX/PYORACLE for computerassisted improvisation."
Context: Integration of Factor Oracle temporal model with CataRT's descriptor-based selection
Confidence: high

---

## 8. Variable Markov Models (VMM) and the Variable Markov Oracle (VMO)

### 8.1 From Factor Oracle to VMO

Claim: "Variable Markov Oracle (VMO) extends previous work on Audio Oracle (AO) in two principal ways - it allows construction of an optimal model by adaptive symbolization of audio features, which in turn allows segmentation or partitioning of the model into regions of similar musical materials."[^27^]
Source: Arias et al., MUME 2016 / Wang & Dubnov
URL: https://musicalmetacreation.org/mume2016/proceedings/Arias_automatic_construction.pdf
Date: 2016
Excerpt: "VMO extends previous work on Audio Oracle (AO) (Dubnov, Assayag, and Cont 2011) in two principal ways - it allows construction of an optimal model by adaptive symbolization of audio features, which in turn allows segmentation or partitioning of the model into regions of similar musical materials."
Context: VMO as the bridge between symbolic Factor Oracle and continuous audio signals
Confidence: high

### 8.2 VMO for Query-Guided Improvisation

Claim: "With a target audio signal indexed by Variable Markov Oracle, a query-matching algorithm is devised to synthesize new music materials by recombination of the target audio matched to a query audio."[^28^]
Source: Wang & Dubnov, AIIDE 2014
URL: https://ojs.aaai.org/index.php/AIIDE/article/view/12767
Date: 2014
Excerpt: "With a target audio signal indexed by Variable Markov Oracle, a query-matching algorithm is devised to synthesize new music materials by recombination of the target audio matched to a query audio. This approach makes the query-matching algorithm a solution to the guided music synthesis problem."
Context: VMO-based guided improvisation enabling cross-alphabet queries (e.g., chord labels to audio)
Confidence: high

### 8.3 VMO-HMM: Context-Aware Hidden Markov Models

Claim: "A framework analyzing symbolic music representation using VMO-HMM is proposed, allowing the VMO to further expand its generative capabilities across different representations... the user could specify a chord label sequence as input to the improvisation system."[^29^]
Source: Wang, PhD Thesis 2018
URL: https://escholarship.org/content/qt7tg5c8rb/qt7tg5c8rb.pdf
Date: 2018
Excerpt: "A framework analyzing symbolic music representation (not limited to MIDI) using VMO-HMM is proposed in this section, allowing the VMO to further expand its generative capabilities across different representations. The most important advancement is that it allows the user to specify a query signal that uses a different alphabet from the target signal."
Context: VMO-HMM bridges different musical representations through shared latent variable space
Confidence: high

---

## 9. MACAT and MACataRT: Integration of SOM, Factor Oracle, and VMM

### 9.1 MACAT's Architecture

Claim: "MACAT utilizes concatenative sound synthesis and offers improved visualization... It employs the SOM and Factor Oracle (FO), a suffix automaton for real-time pattern recognition in sequences of nodes representing clusters of audio segments grouped by timbral similarity. Subsequently, MACAT learns the sequence of nodes using a VMM."[^30^]
Source: MACAT/MACataRT paper, arXiv 2025
URL: https://arxiv.org/html/2502.00023v1
Date: 2025
Excerpt: "At its core, MACAT utilizes concatenative sound synthesis and offers improved visualization for past and current nodes... It employs the SOM and Factor Oracle (FO [17]), a suffix automaton for real-time pattern recognition in sequences of nodes representing clusters of audio segments grouped by timbral similarity... Subsequently, MACAT learns the sequence of nodes using a VMM."
Context: Most recent integration of multiple unit selection strategies: SOM clustering + FO pattern matching + VMM sequence generation
Confidence: high

### 9.2 MACataRT: Adding Temporal Model to CataRT

Claim: "MACataRT integrates the factor oracle to automate the generation process, building on CataRT's audio mosaicing capability... In its proactive improvisation mode, the musical agent system learns sequences of audio segment indices during offline training, enabling the factor oracle to generate music based on these learned sequences."[^31^]
Source: MACAT/MACataRT paper, arXiv 2025
URL: https://arxiv.org/html/2502.00023v1
Date: 2025
Excerpt: "MACataRT enhances this process with interactive audio mosaicing that functions in both real-time and offline modes. In real-time, the musical agent facilitates reactive improvisation... In its proactive improvisation mode, the musical agent system learns sequences of audio segment indices during offline training, enabling the factor oracle to generate music based on these learned sequences."
Context: MACataRT explicitly addresses CataRT's lack of a temporal model by adding Factor Oracle
Confidence: high

---

## 10. Probabilistic and Bayesian Approaches

### 10.1 Bayesian Spectral Matching (Hoffman, Cook & Blei, 2009)

Claim: "We introduce an audio mosaicing technique based on performing posterior inference on a probabilistic generative model... We try to directly match the magnitude spectrogram of a target sound by combining and overlapping a set of short samples at different times and amplitudes."[^32^]
Source: Hoffman, Cook & Blei, ICMC 2009
URL: https://www.cs.columbia.edu/~blei/papers/HoffmanCookBlei2009.pdf
Date: 2009
Excerpt: "We introduce an audio mosaicing technique based on performing posterior inference on a probabilistic generative model. Whereas previous approaches to concatenative synthesis and audio mosaicing have mostly tried to match higher-level descriptors of audio or individual STFT frames, we try to directly match the magnitude spectrogram of a target sound."
Context: First major Bayesian/MCMC approach to audio mosaicing — matching spectrograms directly rather than descriptor vectors
Confidence: high

### 10.2 The Concatenator: Bayesian Particle Filter (Tralie, 2024)

Claim: "We present 'The Concatenator,' a real time system for audio-guided concatenative synthesis... we use an explicitly Bayesian point of view, where corpus window indices are hidden states and the target audio stream is an observation. We use a particle filter to infer the best hidden corpus states in real-time."[^33^]
Source: Tralie, ISMIR 2024
URL: https://arxiv.org/abs/2411.04366
Date: 2024
Excerpt: "We present 'The Concatenator,' a real time system for audio-guided concatenative synthesis... we instead use an explicitly Bayesian point of view, where corpus window indices are hidden states and the target audio stream is an observation. We use a particle filter to infer the best hidden corpus states in real-time."
Context: Breakthrough 2024 paper achieving real-time concatenative synthesis with complexity independent of corpus size
Confidence: high

Claim: "Because the computational complexity of the system is independent of the corpus size, our system scales to corpora that are hours long... The Concatenator advances concatenative synthesis in 3 major ways: 1) capable of accurately reproducing harmonic and percussive sounds using arbitrary corpora 2) in real-time at scale, 3) affording new levels of control and accessibility."[^34^]
Source: Tralie, ISMIR 2024
URL: https://arxiv.org/abs/2411.04366
Date: 2024
Excerpt: "Because the computational complexity of the system is independent of the corpus size, our system scales to corpora that are hours long, which is an important feature in the age of vast audio data collections."
Context: Particle filter approach avoids the O(corpus_size) complexity that plagues NMF-based methods like Driedger's
Confidence: high

Claim: "Caterpillar and audio analogies are both sequentially Bayesian in nature, where the hidden state is the template to concatenate, and the 'observation' is a user-controlled trajectory or features from a source timbre. However, they use the Viterbi algorithm, which is computationally intensive and which needs all time history, so it cannot be applied in real time. By contrast, a particle filter is a scalable Monte Carlo method for sequential Bayesian inference."[^35^]
Source: Tralie, ISMIR 2024
URL: https://arxiv.org/abs/2411.04366
Date: 2024
Excerpt: "Caterpillar and audio analogies are both sequentially Bayesian in nature... they use the Viterbi algorithm, which is computationally intensive and which needs all time history, so it cannot be applied in real time. By contrast, a particle filter is a scalable Monte Carlo method for sequential Bayesian inference."
Context: Explicit theoretical positioning of particle filters as the real-time alternative to Viterbi
Confidence: high

---

## 11. Neural and Deep Learning Hybrids

### 11.1 CoSaRef: Concatenative + Diffusion Refinement (2024)

Claim: "CoSaRef first generates a synthetic audio track using concatenative synthesis based on MIDI input, then refines it with a diffusion-based deep generative model trained on datasets without MIDI annotations... CoSaRef outperformed the state-of-the-art timbre-controllable method based on MIDI supervision in both objective and subjective evaluation."[^36^]
Source: Take & Akama, arXiv 2024/2025
URL: https://arxiv.org/abs/2410.16785
Date: 2024 (v1), 2025 (v2)
Excerpt: "CoSaRef first generates a synthetic audio track using concatenative synthesis based on MIDI input, then refines it with a diffusion-based deep generative model trained on datasets without MIDI annotations. This approach improves the diversity of timbres and expression styles."
Context: Novel hybrid architecture where concatenative synthesis provides the structural backbone and diffusion models add realism
Confidence: high

### 11.2 Latent Granular Resynthesis with Neural Audio Codecs (2025)

Claim: "Neural networks now improve unit selection quality, while concatenative methods provide the authentic source material that neural approaches sometimes lack. Researchers are exploring hybrid approaches that combine concatenative synthesis with diffusion models for MIDI-to-audio synthesis."[^37^]
Source: Vapi.ai blog / ISMIR 2024 trends
URL: https://vapi.ai/blog/concatenative-synthesis
Date: 2025
Excerpt: "Neural networks now improve unit selection quality, while concatenative methods provide the authentic source material that neural approaches sometimes lack. Researchers are exploring hybrid approaches that combine concatenative synthesis with diffusion models for MIDI-to-audio synthesis."
Context: Industry observation of the emerging neural-concatenative hybrid trend
Confidence: medium (industry blog, but cites ISMIR 2024)

---

## 12. Audio Mosaicing: NMF and Spectral Approaches

### 12.1 Driedger's NMF-Based Musaicing (2015)

Claim: "Driedger et al.'s 'Let It Bee' concatenative musaicing technique uses NMF to learn activations of spectral window templates in a corpus collection so that their combination will match a target spectrogram... The algorithm was also implemented in an open source python script in 2018, and in Max by the FluCoMa project in 2021."[^38^]
Source: Tralie, ISMIR 2024 (reviewing Driedger et al. 2015)
URL: https://arxiv.org/abs/2411.04366
Date: 2024 (reviewing 2015)
Excerpt: "Driedger et al.'s 2015 'Let It Bee' concatenative musaicing technique uses NMF to learn activations of spectral window templates in a corpus collection so that their combination will match a target spectrogram."
Context: Driedger's NMF method is the most widely adopted audio mosaicing technique in electronic music production
Confidence: high

### 12.2 MoSievius: Feature-Driven Interactive Audio Mosaicing (2003)

Claim: "MoSievius provides real-time control over the source selection process when creating an audio mosaic... All feature extraction is performed with the Marcyas framework. An implementation for retrieval by content using a fast k-nearest neighbor search with the use of arbitrary sets of features is provided."[^39^]
Source: Lazier & Cook, DAFx 2003
URL: https://soundlab.cs.princeton.edu/publications/mosievius_dafx_2003.pdf
Date: 2003
Excerpt: "All feature extraction is performed with the Marcyas framework. An implementation for retrieval by content using a fast k-nearest neighbor search with the use of arbitrary sets of features is provided."
Context: Early real-time feature-driven mosaicing system with fast k-NN search
Confidence: high

---

## 13. Mixture Methods and Dynamic Programming Variants

### 13.1 Coleman's Mixture Mosaicing (2015)

Claim: "Several new mosaicing strategies were developed: algorithms combining methods from sparse signal processing with perceptually relevant spectral descriptors... rather than choosing a single transformed source unit to approximate each target unit, the methods use mixtures, i.e. sums of pitch-shifted transpositions of the source signals."[^40^]
Source: Coleman, PhD Thesis 2015
URL: https://www.tdx.cat/bitstream/10803/392138/1/tgkc.pdf
Date: 2015
Excerpt: "Rather than choosing a single transformed source unit to approximate each target unit, the methods of this chapter use mixtures, i.e. sums of pitch-shifted transpositions of the source signals at different sampling positions, in order to better approximate the harmony and timbre of the target signals."
Context: PhD thesis from UPF/MTG advancing mixture-based mosaicing with multiple algorithm variants
Confidence: high

Claim: "The following mosaicing algorithms were compared: near (classic nearest-neighbor), mix (mixture method), tracks (hybrid), dp (dynamic programming path search), and mp (matching pursuit)."[^41^]
Source: Coleman, PhD Thesis 2015
URL: https://www.tdx.cat/bitstream/10803/392138/1/tgkc.pdf
Date: 2015
Excerpt: "The following mosaicing algorithms were compared: near - Classic nearest-neighbor matching done on a frame-by-frame basis... dp - My implementation of dynamic programming path search, supporting continuity but not mixtures."
Context: Systematic comparison of mosaicing algorithms including a DP variant for continuity
Confidence: high

---

## 14. Vector Databases and Modern Approximate Search

### 14.1 FAISS and ANN for Audio

Claim: "FAISS (Facebook AI Similarity Search) is an open-source library for efficient similarity search and clustering of dense vectors... It serves as the NumPy of vector search."[^42^]
Source: PyImageSearch / Medium 2024-2026
URL: https://pyimagesearch.com/2026/02/16/vector-search-with-faiss-approximate-nearest-neighbor-ann-explained/
Date: 2026
Excerpt: "FAISS (Facebook AI Similarity Search) is an open-source library developed by Meta AI for efficient similarity search and clustering of dense vectors. It's implemented in highly optimized C++ with Python bindings and optional GPU support."
Context: Modern vector search infrastructure that could be applied to audio descriptor databases
Confidence: high

### 14.2 Scaling Audio Search with Vector Databases

Claim: "Vector databases optimize similarity search using indexing techniques like HNSW, IVF, and PQ... Audio embeddings are often high-dimensional, leading to the curse of dimensionality."[^43^]
Source: Medium article on scaling audio similarity search
URL: https://medium.com/@zilliz_learn/scaling-audio-similarity-search-with-vector-databases-30bccfd70279
Date: 2025
Excerpt: "Vector databases optimize similarity search using indexing techniques like: HNSW (Hierarchical Navigable Small World), IVF (Inverted File Index), PQ (Product Quantization)."
Context: Practical guide to modern vector database techniques for audio retrieval
Confidence: medium (technical blog)

---

## 15. Key Tensions and Counter-Narratives

### 15.1 Global Optimality vs. Real-Time Performance

The central tension in unit selection is between finding the globally optimal sequence (Viterbi) and responding in real-time (greedy/k-NN):

Claim: "Contrary to the systems above, real-time concatenative synthesis systems can not provide a globally optimal selection, because the target is not known entirely in advance. Also, concatenation quality is rarely included in the selection algorithm."[^44^]
Source: Schwarz et al., DAFX 2006
URL: https://www.dafx.de/paper-archive/2006/papers/p_279.pdf
Date: 2006
Excerpt: "Contrary to the systems above, real-time concatenative synthesis systems can not provide a globally optimal selection, because the target is not known entirely in advance. Also, concatenation quality is rarely included in the selection algorithm."
Context: Fundamental architectural trade-off in concatenative synthesis design
Confidence: high

Claim: "None of the systems cited in this section use advance planning by minimizing transition costs (in contrast to some of the systems of the main Section 2.1, i.e. Caterpillar, Musaicing, or Audio Analogies). This is likely due to its high computational cost."[^45^]
Source: Coleman, PhD Thesis 2015
URL: https://www.tdx.cat/bitstream/10803/392138/1/tgkc.pdf
Date: 2015
Excerpt: "None of the systems cited in this section use advance planning by minimizing transition costs... This is likely due to its high computational cost. Instead, more immediate selection methods are used."
Context: Coleman confirms that real-time systems avoid DP/transition cost minimization
Confidence: high

### 15.2 Descriptor-Based vs. Spectral-Direct Matching

Another tension exists between matching in descriptor space (CataRT, MoSievius) vs. direct spectral matching (Driedger NMF, Coleman mixtures):

Claim: "Current audio mosaicing techniques take advantage of the description of future target units in order to make more intelligent decisions when choosing individual segments. In this paper, we investigate ways to expand mosaicing techniques in order to use the mosaicing process as an interactive means of musical expression in real time."[^46^]
Source: Lazier & Cook, DAFx 2003
URL: https://soundlab.cs.princeton.edu/publications/mosievius_dafx_2003.pdf
Date: 2003
Excerpt: "Current audio mosaicing techniques take advantage of the description of future target units in order to make more intelligent decisions when choosing individual segments. In this paper, we investigate ways to expand mosaicing techniques in order to use the mosaicing process as an interactive means of musical expression in real time."
Context: MoSievius explicitly trades lookahead capability for real-time interactivity
Confidence: high

### 15.3 Trained vs. Untrained Systems

Claim: "Unlike neural audio systems, The Concatenator requires no training and can adapt to arbitrary corpora at runtime."[^47^]
Source: Tralie, ISMIR 2024
URL: https://arxiv.org/abs/2411.04366
Date: 2024
Excerpt: "Furthermore, unlike neural audio systems, it requires no training and can adapt to arbitrary corpora at runtime."
Context: One advantage of classical concatenative methods over neural approaches is runtime adaptability
Confidence: high

---

## 16. Current State (2024–2026)

### 16.1 Recent Breakthroughs

1. **The Concatenator (ISMIR 2024)**: First real-time Bayesian particle filter approach with corpus-size-independent complexity, using P particles each representing p corpus windows, with a KL-divergence observation model.

2. **CoSaRef (2024/2025)**: First successful integration of concatenative synthesis with diffusion-based refinement, eliminating the need for MIDI-audio paired training data.

3. **MACAT/MACataRT (2025)**: Integration of SOM clustering, Factor Oracle pattern matching, and VMM sequence learning into a unified real-time musical agent.

4. **Neural-Concatenative Hybrids**: Emerging trend combining classical unit selection with neural vocoders/refinement (observed at ISMIR 2024 and in latent granular resynthesis research).

### 16.2 Vector Database Adoption

Modern audio search is beginning to leverage FAISS, HNSW, and product quantization — techniques from the information retrieval community that were not originally designed for audio but are being adopted for large-scale corpus navigation.

---

## 17. Key Actors & Stakeholders

| Actor | Institution | Contribution |
|-------|-------------|--------------|
| Andrew Hunt & Alan Black | ATR / Edinburgh | Foundational unit selection framework (1996) |
| Diemo Schwarz | IRCAM | Caterpillar, CataRT, distance mapping, scalability research |
| Francois Pachet & Jean-Julien Aucouturier | Sony CSL / IRCAM | Constraint satisfaction (Musical Mosaics, Ringomatic) |
| Pierre Roy | LIP6 / Sony CSL | Constraint-based music generation, playlist generation |
| Gerard Assayag & Shlomo Dubnov | IRCAM / UCSD | Factor Oracle, Audio Oracle, VMO for improvisation |
| Cheng-i Wang | UCSD | Variable Markov Oracle, VMO-HMM |
| Ari Lazier & Perry Cook | Princeton | MoSievius feature-driven mosaicing |
| Matthew Hoffman, David Blei | Princeton | Bayesian spectral matching (MCMC) |
| Christopher Tralie | Ursinus College | The Concatenator (Bayesian particle filter, 2024) |
| Osamu Take & Taketo Akama | Sony CSL | CoSaRef (concatenative + diffusion, 2024) |
| Graham Coleman | UPF / MTG | Mixture mosaicing, descriptor-driven transformations |
| Jonathan Driedger et al. | MPI | NMF-based audio mosaicing (2015) |
| Dominik Schnitzer et al. | OFAI | Fast audio similarity search for millions of tracks |

---

## 18. Concrete Tools and Implementations

| Tool | Year | Selection Strategy | Real-Time? | Open Source? |
|------|------|-------------------|------------|--------------|
| CHATR | 1996 | Viterbi + pruned beam search | Near-real-time | No |
| Caterpillar | 2000-2004 | Viterbi path-search | No | No |
| Musical Mosaics | 2001 | Constraint satisfaction | No | No |
| MoSievius | 2003 | Fast k-NN, feature-driven | Yes | Yes |
| CataRT | 2005-2006 | Mahalanobis k-NN + kd-tree | Yes | Yes |
| Ringomatic | 2005 | Constraint satisfaction (local search) | Yes | No |
| PyOracle / OMax | ~2008 | Factor Oracle navigation | Yes | Yes |
| VMO | 2014-2018 | VMO query-matching | Yes | Yes (GitHub) |
| CatOracle | ~2015 | CataRT + PyOracle | Yes | Yes (MuBu) |
| The Concatenator | 2024 | Bayesian particle filter | Yes | Yes (Python) |
| MACAT / MACataRT | 2025 | SOM + FO + VMM | Yes | Yes |
| CoSaRef | 2024 | Concatenative + diffusion | No | No |
| fluid.bufnmfcross (FluCoMa) | 2021 | NMF-based (Driedger) | No | Yes |

---

## 19. Summary of Findings

### Historical Evolution

1. **1996**: Hunt & Black establish the dual-cost (target + concatenation) framework with Viterbi decoding for speech.
2. **2000–2004**: Schwarz adapts this to music in Caterpillar, using weighted Euclidean distance and Viterbi path-search.
3. **2001**: Zils & Pachet introduce constraint satisfaction as an alternative to Viterbi.
4. **2003**: Lazier & Cook demonstrate real-time feature-driven mosaicing with fast k-NN.
5. **2005–2006**: CataRT abandons global Viterbi for real-time Mahalanobis k-NN with PCA-based kd-trees.
6. **2005**: Factor Oracle is introduced to music by the IRCAM improvisation group.
7. **2009**: Bayesian spectral matching (Hoffman/Cook/Blei) and scalability research (Schwarz/Schnell/Gulluni) advance the field.
8. **2011–2018**: VMO extends Audio Oracle with adaptive symbolization and query-matching across different alphabets.
9. **2015**: Driedger's NMF mosaicing becomes widely adopted in electronic music.
10. **2024**: The Concatenator achieves real-time Bayesian inference via particle filters, with complexity independent of corpus size.
11. **2024–2025**: CoSaRef and neural-concatenative hybrids emerge, combining classical unit selection with deep generative refinement.

### Key Trade-offs

- **Viterbi (global optimal)** vs. **greedy/particle filter (real-time)**
- **Descriptor-space matching** vs. **direct spectral matching**
- **Trained neural models** vs. **runtime-adaptive classical methods**
- **Single-unit selection** vs. **mixture-based approximation**
- **Exact search (kd-tree)** vs. **approximate search (ANN, particle filters)**

### Open Questions

1. Can Viterbi-style global optimization be approximated in real-time without sacrificing interactivity?
2. How can concatenation cost be incorporated into real-time systems like CataRT?
3. What is the optimal balance between descriptor-based and spectral-direct matching?
4. Can vector database techniques (HNSW, PQ) improve scalability beyond current kd-tree limits?
5. How can neural refinement (diffusion, vocoders) be integrated without losing the real-time adaptability of classical concatenative methods?

---

## References (Inline Citations)

[^1^] Hunt & Black, "Unit Selection in a Concatenative Speech Synthesis System Using a Large Speech Database," ICASSP 1996.
[^2^] Hunt & Black, ICASSP 1996, target cost formulation.
[^3^] Hunt & Black, ICASSP 1996, concatenation cost formulation.
[^4^] Hunt & Black, ICASSP 1996, regression training.
[^5^] Hunt & Black, ICASSP 1996, pruning and beam search.
[^6^] Schwarz, "The Caterpillar System for Data-Driven Concatenative Sound Synthesis," DAFx 2003.
[^7^] Schwarz, "A System for Data-Driven Concatenative Sound Synthesis," DAFx 2000.
[^8^] Schwarz, PhD Thesis, IRCAM 2004.
[^9^] Aalto Speech Processing Book / Rabiner & Schafer 2007.
[^10^] Schwarz et al., "Real-Time Corpus-Based Concatenative Synthesis with CataRT," DAFx 2006.
[^11^] Schwarz et al., DAFx 2006 / JIM 2008, Mahalanobis distance.
[^12^] Schwarz et al., DAFx 2006, exact distance formula.
[^13^] Schwarz et al., DAFx 2006, PCA kd-tree.
[^14^] Schwarz, "Distance Mapping for Corpus-Based Concatenative Synthesis," SMC 2011.
[^15^] Schwarz, Schnell & Gulluni, "Scalability in Content-Based Navigation of Sound Databases," ICMC 2009.
[^16^] Schnitzer, Flexer & Widmer, "A Filter-and-Refine Indexing Method for Fast Similarity Search in Millions of Music Tracks," ISMIR 2009.
[^17^] Roy et al. (cited in Schnitzer et al. 2009).
[^18^] Zils & Pachet, "Musical Mosaicing," DAFx 2001 (cited in Aucouturier & Pachet 2005).
[^19^] Schwarz, "Concatenative Sound Synthesis: The Early Years," JNMR 2006.
[^20^] Aucouturier & Pachet, "Ringomatic," ISMIR 2005.
[^21^] Aucouturier & Pachet, ISMIR 2005, CSP background.
[^22^] Pachet, Roy & Cazaly, "A Combinatorial Approach to Content-based Music Selection," ECAI 2000.
[^23^] Allauzen, Crochemore & Raffinot, "Factor Oracle," SOFSEM 1999.
[^24^] Assayag, Dubnov et al., "Using Factor Oracles for Machine Improvisation."
[^25^] Assayag et al., Factor Oracle modifications.
[^26^] CatOracle documentation, HAL.
[^27^] Wang & Dubnov / Arias et al., VMO description.
[^28^] Wang & Dubnov, "Guided Music Synthesis with Variable Markov Oracle," AIIDE 2014.
[^29^] Wang, PhD Thesis, UCSD 2018.
[^30^] MACAT/MACataRT, arXiv 2025.
[^31^] MACataRT description, arXiv 2025.
[^32^] Hoffman, Cook & Blei, "Bayesian Spectral Matching," ICMC 2009.
[^33^] Tralie, "The Concatenator," ISMIR 2024.
[^34^] Tralie, ISMIR 2024, corpus scalability.
[^35^] Tralie, ISMIR 2024, Viterbi vs. particle filter.
[^36^] Take & Akama, "CoSaRef," arXiv 2024.
[^37^] Vapi.ai blog, "How to Create Natural Audio Using Concatenative Synthesis," 2025.
[^38^] Driedger et al., "Let It Bee," 2015 (cited in Tralie 2024).
[^39^] Lazier & Cook, "MoSievius," DAFx 2003.
[^40^] Coleman, PhD Thesis, UPF 2015.
[^41^] Coleman, PhD Thesis 2015, algorithm comparison.
[^42^] PyImageSearch, FAISS tutorial 2026.
[^43^] Medium, "Scaling Audio Similarity Search with Vector Databases," 2025.
[^44^] Schwarz et al., DAFx 2006, real-time limitations.
[^45^] Coleman, PhD Thesis 2015, transition cost trade-off.
[^46^] Lazier & Cook, DAFx 2003.
[^47^] Tralie, ISMIR 2024.

---

*End of Research Report — Dimension 03: Unit Selection Algorithms & Search Strategies*
