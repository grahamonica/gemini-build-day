export type BoundingBox = {
    x: number; // normalized 0-1
    y: number; // normalized 0-1
    width: number; // normalized 0-1
    height: number; // normalized 0-1
};

export interface ProblemInit {
    id: string;
    title: string;
    text: string;
    latex?: string[];
    sourceImage?: string;
    croppedImage?: string;
    bbox?: BoundingBox | null;
    page?: number;
}

export class Problem {
    id: string;
    title: string;
    text: string;
    latex: string[];
    sourceImage?: string;
    croppedImage?: string;
    bbox?: BoundingBox | null;
    page?: number;

    constructor({ id, title, text, latex, sourceImage, croppedImage, bbox, page }: ProblemInit) {
        this.id = id;
        this.title = title;
        this.text = text;
        this.latex = latex ?? [];
        this.sourceImage = sourceImage;
        this.croppedImage = croppedImage;
        this.bbox = bbox ?? null;
        this.page = page;
    }
}
