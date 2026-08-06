import { z } from "zod";

export const userRoleSchema = z.enum(["ADMIN", "GENERAL"]);
export type UserRole = z.infer<typeof userRoleSchema>;

export const userStatusSchema = z.enum(["PENDING", "ACTIVE"]);
export type UserStatus = z.infer<typeof userStatusSchema>;

// 이메일은 어디서 들어오든 항상 소문자로 맞춘다 — 모바일 키보드의 자동 대문자 때문에
// "Kim@x.com"으로 가입해놓고 "kim@x.com"으로 로그인이 안 되는 사고가 나기 쉽다
// (Postgres의 unique 제약과 findUnique 조회는 대소문자를 구분한다).
const emailSchema = z
  .string()
  .email()
  .transform((value) => value.trim().toLowerCase());

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: emailSchema,
  password: z.string().min(8),
  role: userRoleSchema.default("GENERAL"),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

// 공개 회원가입 — 역할과 상태는 서버가 정한다(항상 GENERAL + 승인 대기).
export const registerSchema = z.object({
  name: z.string().min(1),
  email: emailSchema,
  password: z.string().min(8),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const bootstrapAdminSchema = z.object({
  name: z.string().min(1),
  email: emailSchema,
  password: z.string().min(8),
});
export type BootstrapAdminInput = z.infer<typeof bootstrapAdminSchema>;

export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: emailSchema.optional(),
  currentPassword: z.string().min(8).optional(),
  newPassword: z.string().min(8).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

// 관리자가 다른 구성원의 계정을 수정할 때. 비밀번호는 별도 라우트로 분리했다 —
// 이름/역할 수정과 자격 증명 재설정은 위험도가 달라서 한 요청에 섞이면 안 된다.
export const updateUserSchema = z
  .object({
    name: z.string().min(1).optional(),
    email: emailSchema.optional(),
    role: userRoleSchema.optional(),
    status: userStatusSchema.optional(),
  })
  .refine((data) => Object.keys(data).length > 0, { message: "no fields to update" });
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

// 관리자에 의한 비밀번호 초기화 — 기존 비밀번호를 모르는 상태에서 하는 것이라
// currentPassword를 받지 않는다(가족 구성원이 비밀번호를 잊었을 때의 유일한 복구 경로).
export const adminResetPasswordSchema = z.object({
  newPassword: z.string().min(8),
});
export type AdminResetPasswordInput = z.infer<typeof adminResetPasswordSchema>;
