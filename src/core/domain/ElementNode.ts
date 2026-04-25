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
   associatedLabel?: string;
   accessibleName?: string;
  ariaLabel?: string;
  role?: string;
   inferredRole?: string;
  dataTestId?: string;
  className?: string;
  href?: string;
   parentContext?: string;
   siblingContext?: string;
  visible: boolean;
  enabled: boolean;
  boundingBox?: BoundingBox;
}
