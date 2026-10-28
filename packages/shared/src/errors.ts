/** Every error response from the API has this shape. `issues` lists validation messages on a 400. */
export interface ApiError {
  error: string;
  issues?: string[];
}
