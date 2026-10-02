import { prisma } from "@/lib/prisma";

export type Role = "APPLICANT" | "BPLO" | "SUPER_ADMIN" | "DEPARTMENT_HEAD" | "JIT";

export interface DbUser {
  id: string;
  userId: string;
  email: string;
  name: string;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  suffix?: string | null;
  profileImageStoragePath?: string | null;
  profileImageBucket?: string | null;
  profileImageMimeType?: string | null;
  profileImageSizeBytes?: number | null;
  profileImageUploadedAt?: Date | null;
  /** bcrypt-hashed password stored in DB */
  passwordHash: string;
  role: Role;
  isActive: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export async function getUserByEmail(email: string): Promise<DbUser | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      userId: true,
      email: true,
      name: true,
      firstName: true,
      middleName: true,
      lastName: true,
      suffix: true,
      profileImageStoragePath: true,
      profileImageBucket: true,
      profileImageMimeType: true,
      profileImageSizeBytes: true,
      profileImageUploadedAt: true,
      passwordHash: true,
      role: true,
      isActive: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) return null;

  return {
    ...user,
    id: user.userId,
    role: user.role as Role,
  };
}

