import { z } from "zod";

export const MOVIE_MIN_LENGTH = 1;
export const MOVIE_MAX_LENGTH = 120;

/**
 * Server-side validation for the favorite movie.
 * Trims, collapses internal whitespace, rejects control characters, enforces length.
 * The max matches the VARCHAR(120) column so the DB is the last line of defense.
 */
export const movieTitleSchema = z
  .string({ error: "Please enter a movie title." })
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .pipe(
    z
      .string()
      .min(MOVIE_MIN_LENGTH, "Please enter a movie title.")
      .max(MOVIE_MAX_LENGTH, `Movie title must be ${MOVIE_MAX_LENGTH} characters or fewer.`)
      .refine((s) => !/[\u0000-\u001f\u007f]/.test(s), "Movie title contains invalid characters."),
  );
