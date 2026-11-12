import type { CSSProperties, ReactElement } from "react";

export type TLatticePattern = string | { cells: (number | null)[]; loop?: number; scale?: number; lit?: number };

export type TLatticeLoaderProps = {
  label?: string;
  doneLabel?: string;
  errorLabel?: string;
  status?: "working" | "done" | "error";
  pattern?: TLatticePattern;
  grid?: 3 | 4;
  shape?: "square" | "round";
  color?: string;
  doneColor?: string;
  errorColor?: string;
  cellSize?: number;
  gap?: number;
  fontSize?: number;
  step?: number;
  idleOpacity?: number;
  glow?: boolean;
  glowColor?: string;
  showTimer?: boolean;
  elapsed?: number;
  className?: string;
  style?: CSSProperties;
};

declare const LatticeLoader: (props: TLatticeLoaderProps) => ReactElement;
export default LatticeLoader;
