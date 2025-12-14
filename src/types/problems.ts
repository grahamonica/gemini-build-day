export type ProblemBoundingBox = {
    page: number;
    x: number;
    y: number;
    width: number;
    height: number;
};

export type ParsedProblem = {
    index: number;
    text: string;
    summary: string;
    imageUrl?: string | null;
    boundingBox?: ProblemBoundingBox | null;
};
