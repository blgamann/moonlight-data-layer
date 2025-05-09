// tests/profile-interest.spec.ts
import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient, User } from "@prisma/client";

const prisma = new PrismaClient();

describe("ProfileInterest Model (transactional)", () => {
  let interestedUser!: User;
  let targetUser!: User;

  /** 공통 초기화 */
  beforeEach(async () => {
    await prisma.$transaction([
      prisma.profileInterest.deleteMany(),
      prisma.notification.deleteMany(),
      prisma.soulmate.deleteMany(),
      prisma.soullinkRequest.deleteMany(),
      prisma.answerInterest.deleteMany(),
      prisma.answer.deleteMany(),
      prisma.bookshelfEntry.deleteMany(),
      prisma.user.deleteMany(),
      prisma.book.deleteMany(),
    ]);

    const ts = Date.now();

    [interestedUser, targetUser] = await prisma.$transaction(async (tx) => {
      const iu = await tx.user.create({
        data: {
          email: `iu_${ts}@ex.com`,
          passwordHash: "pw1",
          name: "IU",
        },
      });
      const tu = await tx.user.create({
        data: {
          email: `tu_${ts}@ex.com`,
          passwordHash: "pw2",
          name: "TU",
        },
      });
      return [iu, tu];
    });
  });

  it("creates a profile interest", async () => {
    const pi = await prisma.$transaction((tx) =>
      tx.profileInterest.create({
        data: {
          interestedUserId: interestedUser.id,
          targetUserId: targetUser.id,
        },
      })
    );

    expect(pi.interestedUserId).toBe(interestedUser.id);

    const withRelations = await prisma.profileInterest.findUnique({
      where: { id: pi.id },
      include: { interestedUser: true, targetUser: true },
    });
    expect(withRelations?.targetUser.name).toBe(targetUser.name);
  });

  it("blocks duplicate (interestedUserId, targetUserId)", async () => {
    await prisma.profileInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetUserId: targetUser.id,
      },
    });

    await expect(
      prisma.profileInterest.create({
        data: {
          interestedUserId: interestedUser.id,
          targetUserId: targetUser.id,
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("allows different users to like same target", async () => {
    const otherUser = await prisma.user.create({
      data: { email: `o_${Date.now()}@ex.com`, passwordHash: "pw" },
    });

    await prisma.$transaction(async (tx) => {
      await tx.profileInterest.create({
        data: {
          interestedUserId: interestedUser.id,
          targetUserId: targetUser.id,
        },
      });
      await tx.profileInterest.create({
        data: { interestedUserId: otherUser.id, targetUserId: targetUser.id },
      });
    });

    const list = await prisma.profileInterest.findMany({
      where: { targetUserId: targetUser.id },
    });
    expect(list.length).toBe(2);
  });

  it("allows same user to like different targets", async () => {
    const anotherTarget = await prisma.user.create({
      data: { email: `at_${Date.now()}@ex.com`, passwordHash: "pw" },
    });

    await prisma.$transaction(async (tx) => {
      await tx.profileInterest.create({
        data: {
          interestedUserId: interestedUser.id,
          targetUserId: targetUser.id,
        },
      });
      await tx.profileInterest.create({
        data: {
          interestedUserId: interestedUser.id,
          targetUserId: anotherTarget.id,
        },
      });
    });

    const mine = await prisma.profileInterest.findMany({
      where: { interestedUserId: interestedUser.id },
    });
    expect(mine.length).toBe(2);
  });

  it("allows self-interest (policy dependent)", async () => {
    const selfPi = await prisma.$transaction((tx) =>
      tx.profileInterest.create({
        data: {
          interestedUserId: interestedUser.id,
          targetUserId: interestedUser.id,
        },
      })
    );
    expect(selfPi).toBeDefined();
  });

  it("deletes a profile interest", async () => {
    const pi = await prisma.profileInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetUserId: targetUser.id,
      },
    });

    await prisma.$transaction((tx) =>
      tx.profileInterest.delete({ where: { id: pi.id } })
    );

    const shouldBeNull = await prisma.profileInterest.findUnique({
      where: { id: pi.id },
    });
    expect(shouldBeNull).toBeNull();
  });

  it("cascades when interested user is deleted", async () => {
    await prisma.profileInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetUserId: targetUser.id,
      },
    });

    await prisma.$transaction((tx) =>
      tx.user.delete({ where: { id: interestedUser.id } })
    );

    const remains = await prisma.profileInterest.findMany({
      where: { interestedUserId: interestedUser.id },
    });
    expect(remains.length).toBe(0);
  });

  it("cascades when target user is deleted", async () => {
    await prisma.profileInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetUserId: targetUser.id,
      },
    });

    await prisma.$transaction((tx) =>
      tx.user.delete({ where: { id: targetUser.id } })
    );

    const remains = await prisma.profileInterest.findMany({
      where: { targetUserId: targetUser.id },
    });
    expect(remains.length).toBe(0);
  });
});
