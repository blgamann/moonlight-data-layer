// tests/notification.integration.spec.ts
import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient, User, NotificationType } from "@prisma/client";

const prisma = new PrismaClient();

describe("Notification Integration (transactional)", () => {
  let userA!: User;
  let userB!: User;

  /** 공통 초기화 */
  beforeEach(async () => {
    await prisma.$transaction([
      prisma.notification.deleteMany(),
      prisma.soulmate.deleteMany(),
      prisma.soullinkRequest.deleteMany(),
      prisma.profileInterest.deleteMany(),
      prisma.answerInterest.deleteMany(),
      prisma.answer.deleteMany(),
      prisma.question.deleteMany(),
      prisma.bookshelfEntry.deleteMany(),
      prisma.book.deleteMany(),
      prisma.user.deleteMany(),
    ]);

    const ts = Date.now();
    const sfx = () => Math.random().toString(36).slice(2, 6);

    [userA, userB] = await prisma.$transaction(async (tx) => {
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
      return [a, b];
    });
  });

  /* ───────────────────────── MUTUAL PROFILE INTEREST ───────────────────────── */
  it("creates MUTUAL_PROFILE_INTEREST notifications", async () => {
    await prisma.$transaction(async (tx) => {
      await tx.profileInterest.create({
        data: { interestedUserId: userA.id, targetUserId: userB.id },
      });
      await tx.profileInterest.create({
        data: { interestedUserId: userB.id, targetUserId: userA.id },
      });

      // 알림 생성
      await tx.notification.createMany({
        data: [
          {
            userId: userA.id,
            type: "MUTUAL_PROFILE_INTEREST",
            content: `${userB.name}님과 서로 관심을 표현했습니다.`,
            relatedUserId: userB.id,
          },
          {
            userId: userB.id,
            type: "MUTUAL_PROFILE_INTEREST",
            content: `${userA.name}님과 서로 관심을 표현했습니다.`,
            relatedUserId: userA.id,
          },
        ],
      });
    });

    const [notifA] = await prisma.notification.findMany({
      where: { userId: userA.id },
    });
    const [notifB] = await prisma.notification.findMany({
      where: { userId: userB.id },
    });

    expect(notifA.type).toBe(NotificationType.MUTUAL_PROFILE_INTEREST);
    expect(notifB.type).toBe(NotificationType.MUTUAL_PROFILE_INTEREST);
  });

  /* ───────────────────────── SOULMATE FORMED ───────────────────────── */
  it("creates SOULMATE_FORMED notifications", async () => {
    await prisma.$transaction(async (tx) => {
      // 상호 소울링크 요청
      await tx.soullinkRequest.createMany({
        data: [
          { senderId: userA.id, receiverId: userB.id },
          { senderId: userB.id, receiverId: userA.id },
        ],
      });

      // 소울메이트 확립(ID 작은 쪽이 userAId)
      const { userAId, userBId } =
        userA.id < userB.id
          ? { userAId: userA.id, userBId: userB.id }
          : { userAId: userB.id, userBId: userA.id };

      const sm = await tx.soulmate.create({ data: { userAId, userBId } });

      // 알림
      await tx.notification.createMany({
        data: [
          {
            userId: userA.id,
            type: "SOULMATE_FORMED",
            content: `${userB.name}님과 소울메이트가 되었습니다.`,
            relatedUserId: userB.id,
            relatedSoulmateId: sm.id,
          },
          {
            userId: userB.id,
            type: "SOULMATE_FORMED",
            content: `${userA.name}님과 소울메이트가 되었습니다.`,
            relatedUserId: userA.id,
            relatedSoulmateId: sm.id,
          },
        ],
      });
    });

    const [notifA] = await prisma.notification.findMany({
      where: { userId: userA.id },
    });
    expect(notifA.type).toBe(NotificationType.SOULMATE_FORMED);
  });

  /* ───────────────────────── 전체 플로우 ───────────────────────── */
  it("runs full flow: mutual interest → soulmate + notifications", async () => {
    await prisma.$transaction(async (tx) => {
      await tx.profileInterest.createMany({
        data: [
          { interestedUserId: userA.id, targetUserId: userB.id },
          { interestedUserId: userB.id, targetUserId: userA.id },
        ],
      });
      await tx.notification.createMany({
        data: [
          {
            userId: userA.id,
            type: "MUTUAL_PROFILE_INTEREST",
            relatedUserId: userB.id,
            content: "관심!",
          },
          {
            userId: userB.id,
            type: "MUTUAL_PROFILE_INTEREST",
            relatedUserId: userA.id,
            content: "관심!",
          },
        ],
      });

      await tx.soullinkRequest.createMany({
        data: [
          { senderId: userA.id, receiverId: userB.id },
          { senderId: userB.id, receiverId: userA.id },
        ],
      });

      const ids =
        userA.id < userB.id
          ? { userAId: userA.id, userBId: userB.id }
          : { userAId: userB.id, userBId: userA.id };
      const sm = await tx.soulmate.create({ data: ids });

      await tx.notification.createMany({
        data: [
          {
            userId: userA.id,
            type: "SOULMATE_FORMED",
            relatedUserId: userB.id,
            relatedSoulmateId: sm.id,
            content: "소울메이트!",
          },
          {
            userId: userB.id,
            type: "SOULMATE_FORMED",
            relatedUserId: userA.id,
            relatedSoulmateId: sm.id,
            content: "소울메이트!",
          },
        ],
      });
    });

    const notiA = await prisma.notification.findMany({
      where: { userId: userA.id },
      orderBy: { createdAt: "asc" },
    });
    const notiB = await prisma.notification.findMany({
      where: { userId: userB.id },
      orderBy: { createdAt: "asc" },
    });

    expect(notiA.map((n) => n.type)).toEqual([
      NotificationType.MUTUAL_PROFILE_INTEREST,
      NotificationType.SOULMATE_FORMED,
    ]);
    expect(notiB.map((n) => n.type)).toEqual(notiA.map((n) => n.type));
  });
});
