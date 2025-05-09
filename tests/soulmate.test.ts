// tests/soulmate.spec.ts
import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient, User } from "@prisma/client";

const prisma = new PrismaClient();

describe("Soulmate Model (transactional)", () => {
  let userA!: User;
  let userB!: User;
  let userC!: User;

  // ID가 작은 쪽을 userAId로 정렬
  const sortIds = (u1: User, u2: User) =>
    u1.id < u2.id
      ? { userAId: u1.id, userBId: u2.id }
      : { userAId: u2.id, userBId: u1.id };

  /** 공통 초기화 */
  beforeEach(async () => {
    await prisma.$transaction([
      prisma.notification.deleteMany(),
      prisma.soulmate.deleteMany(),
      prisma.soullinkRequest.deleteMany(),
      prisma.profileInterest.deleteMany(),
      prisma.answerInterest.deleteMany(),
      prisma.answer.deleteMany(),
      prisma.bookshelfEntry.deleteMany(),
      prisma.user.deleteMany(),
      prisma.book.deleteMany(),
    ]);

    const ts = Date.now();
    const sfx = () => Math.random().toString(36).slice(2, 6);

    [userA, userB, userC] = await prisma.$transaction(async (tx) => {
      const a = await tx.user.create({
        data: {
          email: `a_${ts}_${sfx()}@ex.com`,
          passwordHash: "pw",
          name: "A",
        },
      });
      const b = await tx.user.create({
        data: {
          email: `b_${ts}_${sfx()}@ex.com`,
          passwordHash: "pw",
          name: "B",
        },
      });
      const c = await tx.user.create({
        data: {
          email: `c_${ts}_${sfx()}@ex.com`,
          passwordHash: "pw",
          name: "C",
        },
      });
      return [a, b, c];
    });
  });

  it("creates a soulmate relationship", async () => {
    const { userAId, userBId } = sortIds(userA, userB);

    const sm = await prisma.$transaction((tx) =>
      tx.soulmate.create({ data: { userAId, userBId } })
    );

    expect(sm.userAId).toBe(userAId);

    const rel = await prisma.soulmate.findUnique({
      where: { id: sm.id },
      include: { userA: true, userB: true },
    });
    const expA = userA.id < userB.id ? userA : userB;
    const expB = userA.id < userB.id ? userB : userA;
    expect(rel?.userA.name).toBe(expA.name);
    expect(rel?.userB.name).toBe(expB.name);
  });

  it("blocks duplicate soulmate pair", async () => {
    const ids = sortIds(userA, userB);

    await prisma.soulmate.create({ data: ids });

    await expect(prisma.soulmate.create({ data: ids })).rejects.toMatchObject({
      code: "P2002",
    });
  });

  it("allows different pairs", async () => {
    const idsAB = sortIds(userA, userB);
    const idsAC = sortIds(userA, userC);

    await prisma.$transaction(async (tx) => {
      await tx.soulmate.create({ data: idsAB });
      await tx.soulmate.create({ data: idsAC });
    });

    const list = await prisma.soulmate.findMany({
      where: { OR: [{ userAId: userA.id }, { userBId: userA.id }] },
    });
    expect(list.length).toBe(2);
  });

  it("deletes a soulmate relationship", async () => {
    const ids = sortIds(userA, userB);
    const sm = await prisma.soulmate.create({ data: ids });

    await prisma.$transaction((tx) =>
      tx.soulmate.delete({ where: { id: sm.id } })
    );

    const shouldBeNull = await prisma.soulmate.findUnique({
      where: { id: sm.id },
    });
    expect(shouldBeNull).toBeNull();
  });

  it("cascades when userA is deleted", async () => {
    const ids = sortIds(userA, userB);
    await prisma.soulmate.create({ data: ids });

    await prisma.$transaction((tx) =>
      tx.user.delete({ where: { id: userA.id } })
    );

    const remains = await prisma.soulmate.findMany({
      where: { OR: [{ userAId: userA.id }, { userBId: userA.id }] },
    });
    expect(remains.length).toBe(0);
  });

  it("cascades when userB is deleted", async () => {
    const ids = sortIds(userA, userB);
    await prisma.soulmate.create({ data: ids });

    await prisma.$transaction((tx) =>
      tx.user.delete({ where: { id: userB.id } })
    );

    const remains = await prisma.soulmate.findMany({
      where: { OR: [{ userAId: userB.id }, { userBId: userB.id }] },
    });
    expect(remains.length).toBe(0);
  });
});
