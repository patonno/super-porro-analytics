export interface Score {
  h: string;
  a: string;
}

export interface Groups {
  [matchId: string]: Score;
}

export interface Knockout {
  r16?: string[]; // 32 teams in 16avos (user picks or official)
  r8?: string[];  // 16 teams in octavos
  r4?: string[];  // 8 teams in cuartos
  r2?: string[];  // 4 teams in semis
  final?: {
    champ: string;
    sub: string;
    third: string;
  };
  pichi?: {
    world: string;
    esp: string;
  };
}

export interface Pichichi {
  world: string;
  esp: string;
}

export interface Entry {
  id: string;
  nombre: string;
  grupos: Groups;
  knockout: {
    r16?: string[] | { [key: string]: string };
    r8?: string[] | { [key: string]: string };
    r4?: string[] | { [key: string]: string };
    r2?: string[] | { [key: string]: string };
    final?: {
      champ: string;
      sub: string;
      third: string;
    };
  };
  pichichi?: Pichichi;
  updated_at: string;
}

export interface RealData {
  id: number;
  grupos: Groups;
  knockout: Knockout;
  updated_at: string;
}

export interface TeamStanding {
  name: string;
  pts: number;
  gf: number;
  gc: number;
  gd: number;
  pg?: number;
  pe?: number;
  pp?: number;
  pj?: number;
}

export interface ScoreBreakdown {
  grupos: number;
  r16: number;
  r8: number;
  r4: number;
  r2: number;
  final: number;
  pichi: number;
}

export interface ParticipantScore {
  nombre: string;
  pts: number;
  bk: ScoreBreakdown;
}
