import { z } from "zod";

export const recordCategorySchema = z.enum(["MAINTENANCE", "ADMINISTRATIVE"]);
export type RecordCategory = z.infer<typeof recordCategorySchema>;
