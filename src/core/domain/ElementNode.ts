export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElementNode {
  tagName: string;
  text: string;
  id?: string;
  name?: string;
  type?: string;
  placeholder?: string;
  ariaLabel?: string;
  role?: string;
  dataTestId?: string;
  className?: string;
  href?: string;
  visible: boolean;
  enabled: boolean;
  boundingBox?: BoundingBox;
}
