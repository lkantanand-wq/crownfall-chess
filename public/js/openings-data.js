window.CROWNFALL_OPENING_LESSONS = [
  // WHITE OPENINGS
  {
    id: 'italian',
    eco: 'C50',
    name: 'Italian Game',
    side: 'White',
    summary: 'Rapid development targeting the weak f7 square with classical center control.',
    steps: [
      { san: 'e4', why: 'Claims the center immediately and opens diagonals for White’s Queen and King’s Bishop.' },
      { san: 'e5', why: 'Black mirrors White to fight for equal central space on d4 and f4.' },
      { san: 'Nf3', why: 'Develops a knight toward the center while attacking Black’s undefended e5 pawn.' },
      { san: 'Nc6', why: 'Defends the e5 pawn naturally and controls the d4 square.' },
      { san: 'Bc4', why: 'Best square for the bishop: eyes the vulnerable f7 pawn and prepares quick kingside castling.' },
      { san: 'Bc5', why: 'Black develops actively to mirror White’s pressure on f2.' },
      { san: 'c3', why: 'Prepares a strong d4 pawn push to build a classic two-pawn center.' }
    ]
  },
  {
    id: 'ruy-lopez',
    eco: 'C60',
    name: 'Ruy Lopez (Spanish)',
    side: 'White',
    summary: 'Puts immediate pressure on Black’s e5 defender (Nc6) for long-term strategic advantage.',
    steps: [
      { san: 'e4', why: 'Controls d5 and f5 while freeing the bishop and queen.' },
      { san: 'e5', why: 'Challenges White’s central claim directly.' },
      { san: 'Nf3', why: 'Attacks e5 and prepares kingside castling.' },
      { san: 'Nc6', why: 'Solidly defends e5.' },
      { san: 'Bb5', why: 'The signature Ruy Lopez move: pressures the knight defending e5 and prepares O-O.' },
      { san: 'a6', why: 'Morphy Defense: forces White’s bishop to declare its intentions.' },
      { san: 'Ba4', why: 'Maintains the pin/pressure along the a4-e8 diagonal without conceding the bishop pair.' }
    ]
  },
  {
    id: 'scotch',
    eco: 'C44',
    name: 'Scotch Game',
    side: 'White',
    summary: 'Breaks open the center early on move 3 to seize space and active piece play.',
    steps: [
      { san: 'e4', why: 'Opens lines and stakes a claim in the center.' },
      { san: 'e5', why: 'Matches White in the center.' },
      { san: 'Nf3', why: 'Develops with tempo against e5.' },
      { san: 'Nc6', why: 'Protects the e5 pawn.' },
      { san: 'd4', why: 'Immediately challenges Black’s e5 pawn to open central files and diagonals.' },
      { san: 'exd4', why: 'Black must capture to avoid losing central ground.' },
      { san: 'Nxd4', why: 'Centralizes the knight with strong activity and open lines.' }
    ]
  },
  {
    id: 'queens-gambit',
    eco: 'D06',
    name: "Queen's Gambit",
    side: 'White',
    summary: 'Offers a wing pawn on c4 to deflect Black’s d5 pawn and dominate the center.',
    steps: [
      { san: 'd4', why: 'Establishes a firm central foothold supported by the Queen.' },
      { san: 'd5', why: 'Prevents White from playing e4 unchallenged.' },
      { san: 'c4', why: 'Attacks d5 from the flank; if Black takes (dxc4), White regains it easily with e3/Bxc4 and a big center.' },
      { san: 'e6', why: 'Queen’s Gambit Declined: reinforces d5 solidly while opening the f8 bishop.' },
      { san: 'Nc3', why: 'Increases pressure on d5 and controls e4.' },
      { san: 'Nf6', why: 'Develops naturally and defends d5.' }
    ]
  },
  {
    id: 'london',
    eco: 'D02',
    name: 'London System',
    side: 'White',
    summary: 'Solid, reliable pyramid setup with Bf4 and e3 that avoids sharp theoretical traps.',
    steps: [
      { san: 'd4', why: 'Claims central space and opens the dark-squared bishop.' },
      { san: 'd5', why: 'Establishes an equal share of the center.' },
      { san: 'Nf3', why: 'Controls e5 and d4 without committing the c-pawn yet.' },
      { san: 'Nf6', why: 'Develops Black’s knight to its most natural square.' },
      { san: 'Bf4', why: 'Places the dark-squared bishop outside the pawn chain before playing e3.' },
      { san: 'e6', why: 'Prepares c5 or Be7 and solidifies d5.' },
      { san: 'e3', why: 'Creates a rock-solid d4/e3/c3 triangle supporting the center.' }
    ]
  },
  {
    id: 'english',
    eco: 'A10',
    name: 'English Opening',
    side: 'White',
    summary: 'Flank opening controlling d5 from the side, leading to flexible strategic battles.',
    steps: [
      { san: 'c4', why: 'Controls the d5 square from the flank without blocking the d-pawn.' },
      { san: 'e5', why: 'Black seizes central space and prevents d4.' },
      { san: 'Nc3', why: 'Adds further control over d5 and e4.' },
      { san: 'Nf6', why: 'Develops toward the center.' },
      { san: 'g3', why: 'Prepares Bg2 to fianchetto the bishop down the long h1-a8 diagonal.' },
      { san: 'd5', why: 'Black strikes in the center.' },
      { san: 'cxd5', why: 'Trades a flank pawn for a center pawn, giving White a 2-vs-1 central majority.' }
    ]
  },

  // BLACK DEFENSES
  {
    id: 'sicilian',
    eco: 'B20',
    name: 'Sicilian Defense',
    side: 'Black',
    summary: 'The sharpest, highest-scoring defense against 1.e4, creating asymmetrical winning chances.',
    steps: [
      { san: 'e4', why: 'White opens the king’s pawn.' },
      { san: 'c5', why: 'Fights for d4 asymmetrically; Black trades a wing c-pawn for White’s central d-pawn later.' },
      { san: 'Nf3', why: 'Prepares d4 to open the center.' },
      { san: 'd6', why: 'Controls e5 and prepares Nf6 without allowing e5 pushes.' },
      { san: 'd4', why: 'White opens the center.' },
      { san: 'cxd4', why: 'Black exchanges the c-pawn for White’s d-pawn, gaining a half-open c-file.' },
      { san: 'Nxd4', why: 'White centralizes the knight.' },
      { san: 'Nf6', why: 'Attacks e4 immediately, forcing Nc3.' }
    ]
  },
  {
    id: 'caro-kann',
    eco: 'B10',
    name: 'Caro-Kann Defense',
    side: 'Black',
    summary: 'Rock-solid structure that supports d5 with c6 while keeping the light-squared bishop free.',
    steps: [
      { san: 'e4', why: 'White claims the center.' },
      { san: 'c6', why: 'Prepares d5 while keeping the c8-h3 diagonal open for Black’s light-squared bishop.' },
      { san: 'd4', why: 'White builds a full pawn center.' },
      { san: 'd5', why: 'Challenges e4 directly with strong pawn support.' },
      { san: 'Nc3', why: 'Defends e4 and develops.' },
      { san: 'dxe4', why: 'Releases central tension.' },
      { san: 'Nxe4', why: 'White recaptures in the center.' },
      { san: 'Bf5', why: 'Develops the bishop actively with tempo against the e4 knight.' }
    ]
  },
  {
    id: 'french',
    eco: 'C00',
    name: 'French Defense',
    side: 'Black',
    summary: 'Resilient counterattacking setup targeting White’s d4 pawn with c5.',
    steps: [
      { san: 'e4', why: 'White opens the center.' },
      { san: 'e6', why: 'Prepares a solidly supported d5 advance.' },
      { san: 'd4', why: 'White takes the full center.' },
      { san: 'd5', why: 'Strikes at e4 immediately.' },
      { san: 'e5', why: 'Advance Variation: gains space and fixes the pawn chain.' },
      { san: 'c5', why: 'Best counter-break: attacks the base of White’s pawn chain at d4.' },
      { san: 'c3', why: 'Reinforces d4.' },
      { san: 'Nc6', why: 'Adds pressure to d4 and prepares Qb6.' }
    ]
  },
  {
    id: 'kings-indian',
    eco: 'E60',
    name: "King's Indian Defense",
    side: 'Black',
    summary: 'Hypermodern defense letting White build a center first, then attacking it with e5 or c5.',
    steps: [
      { san: 'd4', why: 'White claims central space.' },
      { san: 'Nf6', why: 'Develops flexibly and stops e4.' },
      { san: 'c4', why: 'White expands on the queenside.' },
      { san: 'g6', why: 'Prepares Bg7 to control the long dark-squared diagonal.' },
      { san: 'Nc3', why: 'Prepares e4.' },
      { san: 'Bg7', why: 'Fianchettoes the bishop, aiming straight at d4 and b2.' },
      { san: 'e4', why: 'White builds a massive pawn center.' },
      { san: 'd6', why: 'Prevents e5 and prepares e5 break after O-O.' }
    ]
  },
  {
    id: 'petrov',
    eco: 'C42',
    name: "Petrov's Defense",
    side: 'Black',
    summary: 'Symmetrical, ultra-solid defense neutralizing White’s 1.e4 initiative.',
    steps: [
      { san: 'e4', why: 'White opens the king’s pawn.' },
      { san: 'e5', why: 'Black mirrors in the center.' },
      { san: 'Nf3', why: 'Attacks e5.' },
      { san: 'Nf6', why: 'Counterattacks e4 instead of passively defending e5.' },
      { san: 'Nxe5', why: 'White captures the pawn.' },
      { san: 'd6', why: 'Kicks the knight away before recapturing on e4 (avoiding Qe2 traps).' },
      { san: 'Nf3', why: 'Knight retreats safely.' },
      { san: 'Nxe4', why: 'Black restores material equality with an open, balanced game.' }
    ]
  },
  {
    id: 'scandinavian',
    eco: 'B01',
    name: 'Scandinavian Defense',
    side: 'Black',
    summary: 'Immediate central challenge on move 1 to force an open game.',
    steps: [
      { san: 'e4', why: 'White opens the center.' },
      { san: 'd5', why: 'Directly challenges e4 on move 1, forcing White to react.' },
      { san: 'exd5', why: 'Best response: wins central space.' },
      { san: 'Qxd5', why: 'Recaptures cleanly in the center.' },
      { san: 'Nc3', why: 'Develops with tempo by attacking the Queen.' },
      { san: 'Qa5', why: 'Best square for the Queen: stays active, pins c3 if Bb4 follows, and avoids further attacks.' }
    ]
  }
];
