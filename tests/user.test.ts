// tests/user.spec.ts
import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

describe("User Model (transactional)", () => {
  beforeEach(async () => {
    await prisma.$transaction([
      prisma.notification.deleteMany(),
      prisma.soulmate.deleteMany(),
      prisma.soullinkRequest.deleteMany(), // 모델명: SoulLinkRequest
      prisma.answerInterest.deleteMany(),
      prisma.profileInterest.deleteMany(),
      prisma.answer.deleteMany(),
      prisma.bookshelfEntry.deleteMany(),
      prisma.user.deleteMany(),
    ]);
  });

  it("creates a new user successfully", async () => {
    const newUserEmail = `testuser_${Date.now()}@example.com`;

    const createdUser = await prisma.$transaction(async (tx) => {
      return tx.user.create({
        data: {
          email: newUserEmail,
          passwordHash: "dummy_hashed_password",
          name: "Test User",
          image: "http://example.com/avatar.png",
          bio: "This is a test bio.",
        },
      });
    });

    expect(createdUser.id).toBeDefined();
    expect(createdUser.email).toBe(newUserEmail);
    expect(createdUser.name).toBe("Test User");
    expect(createdUser.image).toBe("http://example.com/avatar.png");
    expect(createdUser.bio).toBe("This is a test bio.");
    expect(createdUser.lastLoginAt).toBeNull();
  });

  it("prevents duplicate e-mail", async () => {
    const email = `dupe_${Date.now()}@example.com`;
    const data = { email, passwordHash: "hash" };

    // 첫 생성
    await prisma.user.create({ data });

    // 중복 생성 테스트 (트랜잭션에 굳이 묶을 필요 X)
    await expect(prisma.user.create({ data })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("finds a user by email", async () => {
    const email = `find_${Date.now()}@example.com`;

    await prisma.user.create({
      data: { email, passwordHash: "hash", name: "Find Me User" },
    });

    const found = await prisma.$transaction((tx) =>
      tx.user.findUnique({ where: { email } })
    );

    expect(found?.name).toBe("Find Me User");
  });

  it("updates name · bio · lastLoginAt", async () => {
    const email = `upd_${Date.now()}@example.com`;
    await prisma.user.create({ data: { email, passwordHash: "hash" } });

    const newValues = {
      name: "Updated",
      bio: "Updated bio",
      lastLoginAt: new Date(),
    };

    const updated = await prisma.$transaction((tx) =>
      tx.user.update({ where: { email }, data: newValues })
    );

    expect(updated.name).toBe(newValues.name);
    expect(updated.bio).toBe(newValues.bio);
    expect(updated.lastLoginAt?.getTime()).toBe(
      newValues.lastLoginAt.getTime()
    );
  });

  it("updates passwordHash", async () => {
    const email = `pw_${Date.now()}@example.com`;
    await prisma.user.create({
      data: { email, passwordHash: "oldHash" },
    });

    const updated = await prisma.$transaction((tx) =>
      tx.user.update({
        where: { email },
        data: { passwordHash: "newHash" },
      })
    );

    expect(updated.passwordHash).toBe("newHash");
    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      updated.createdAt.getTime()
    );
  });

  it("deletes a user", async () => {
    const email = `del_${Date.now()}@example.com`;
    await prisma.user.create({ data: { email, passwordHash: "hash" } });

    await prisma.$transaction((tx) => tx.user.delete({ where: { email } }));

    const shouldBeNull = await prisma.user.findUnique({ where: { email } });
    expect(shouldBeNull).toBeNull();
  });

  it("creates user with required fields only", async () => {
    const email = `req_${Date.now()}@example.com`;

    const user = await prisma.$transaction((tx) =>
      tx.user.create({
        data: { email, passwordHash: "hash" },
      })
    );

    expect(user.email).toBe(email);
    expect(user.name).toBeNull();
    expect(user.image).toBeNull();
    expect(user.bio).toBeNull();
  });
});
