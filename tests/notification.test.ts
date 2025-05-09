// tests/notification.spec.ts
import { describe, it, expect, beforeEach } from "vitest";
import {
  PrismaClient,
  User,
  Book,
  Question,
  Answer,
  Soulmate,
  NotificationType,
} from "@prisma/client";

const prisma = new PrismaClient();

describe("Notification Model (transactional)", () => {
  let testUser!: User;
  let relatedUser!: User;
  let testBook!: Book;
  let testQuestion!: Question;
  let testAnswer!: Answer;
  let testSoulmate!: Soulmate;

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
      prisma.user.deleteMany(),
      prisma.book.deleteMany(),
    ]);

    const ts = Date.now();

    // 픽스처 생성
    [testUser, relatedUser, testBook, testQuestion, testAnswer, testSoulmate] =
      await prisma.$transaction(async (tx) => {
        const u1 = await tx.user.create({
          data: { email: `u1_${ts}@ex.com`, passwordHash: "pw" },
        });
        const u2 = await tx.user.create({
          data: { email: `u2_${ts}@ex.com`, passwordHash: "pw" },
        });
        const book = await tx.book.create({
          data: { isbn: `isbn_${ts}`, title: "B", author: "A", publisher: "P" },
        });
        const q = await tx.question.create({
          data: { bookIsbn: book.isbn, content: "Q?" },
        });
        const ans = await tx.answer.create({
          data: { userId: u2.id, questionId: q.id, content: "Ans" },
        });
        const { userAId, userBId } =
          u1.id < u2.id
            ? { userAId: u1.id, userBId: u2.id }
            : { userAId: u2.id, userBId: u1.id };
        const sm = await tx.soulmate.create({ data: { userAId, userBId } });
        return [u1, u2, book, q, ans, sm];
      });
  });

  /* ─────────── 기본 생성 ─────────── */
  it("creates a notification", async () => {
    const noti = await prisma.$transaction((tx) =>
      tx.notification.create({
        data: {
          userId: testUser.id,
          type: NotificationType.MUTUAL_PROFILE_INTEREST,
          content: "새로운 상호 관심!",
          relatedUserId: relatedUser.id,
        },
      })
    );

    expect(noti.userId).toBe(testUser.id);
    expect(noti.isRead).toBe(false);

    const withUser = await prisma.notification.findUnique({
      where: { id: noti.id },
      include: { user: true },
    });
    expect(withUser?.user.email).toBe(testUser.email);
  });

  /* ─────────── 모든 optional 필드 포함 ─────────── */
  it("creates notification with all optional IDs", async () => {
    const noti = await prisma.$transaction((tx) =>
      tx.notification.create({
        data: {
          userId: testUser.id,
          type: NotificationType.SOULMATE_FORMED,
          content: "소울메이트!",
          relatedUserId: relatedUser.id,
          relatedBookIsbn: testBook.isbn,
          relatedQuestionId: testQuestion.id,
          relatedAnswerId: testAnswer.id,
          relatedSoulmateId: testSoulmate.id,
        },
      })
    );

    expect(noti.relatedSoulmateId).toBe(testSoulmate.id);
  });

  /* ─────────── 사용자 알림 조회 ─────────── */
  it("finds all notifications for a user", async () => {
    await prisma.notification.createMany({
      data: [
        {
          userId: testUser.id,
          type: "MUTUAL_PROFILE_INTEREST",
          content: "알림1",
        },
        { userId: testUser.id, type: "SOULMATE_FORMED", content: "알림2" },
      ],
    });

    const other = await prisma.user.create({
      data: { email: `o_${Date.now()}@ex.com`, passwordHash: "pw" },
    });
    await prisma.notification.create({
      data: {
        userId: other.id,
        type: "MUTUAL_PROFILE_INTEREST",
        content: "무시",
      },
    });

    const list = await prisma.notification.findMany({
      where: { userId: testUser.id },
      orderBy: { createdAt: "desc" },
    });
    expect(list.length).toBe(2);
    expect(list.map((n) => n.content)).toEqual(
      expect.arrayContaining(["알림1", "알림2"])
    );
  });

  /* ─────────── 읽음/읽지 않음 ─────────── */
  it("finds unread notifications", async () => {
    await prisma.notification.createMany({
      data: [
        {
          userId: testUser.id,
          type: "MUTUAL_PROFILE_INTEREST",
          content: "x",
          isRead: false,
        },
        {
          userId: testUser.id,
          type: "SOULMATE_FORMED",
          content: "y",
          isRead: true,
        },
      ],
    });

    const unread = await prisma.notification.findMany({
      where: { userId: testUser.id, isRead: false },
    });
    expect(unread.length).toBe(1);
  });

  it("updates isRead flag", async () => {
    const noti = await prisma.notification.create({
      data: {
        userId: testUser.id,
        type: "MUTUAL_PROFILE_INTEREST",
        content: "to read",
      },
    });

    const upd = await prisma.$transaction((tx) =>
      tx.notification.update({ where: { id: noti.id }, data: { isRead: true } })
    );

    expect(upd.isRead).toBe(true);
  });

  /* ─────────── 삭제 ─────────── */
  it("deletes a notification", async () => {
    const noti = await prisma.notification.create({
      data: {
        userId: testUser.id,
        type: "MUTUAL_PROFILE_INTEREST",
        content: "del",
      },
    });

    await prisma.$transaction((tx) =>
      tx.notification.delete({ where: { id: noti.id } })
    );

    const shouldBeNull = await prisma.notification.findUnique({
      where: { id: noti.id },
    });
    expect(shouldBeNull).toBeNull();
  });

  /* ─────────── 사용자 삭제 연쇄 ─────────── */
  it("cascades when owning user is deleted", async () => {
    await prisma.notification.create({
      data: {
        userId: testUser.id,
        type: "MUTUAL_PROFILE_INTEREST",
        content: "gone",
      },
    });

    const other = await prisma.user.create({
      data: { email: `x_${Date.now()}@ex.com`, passwordHash: "pw" },
    });
    const otherNoti = await prisma.notification.create({
      data: {
        userId: other.id,
        type: "MUTUAL_PROFILE_INTEREST",
        content: "stay",
      },
    });

    await prisma.$transaction((tx) =>
      tx.user.delete({ where: { id: testUser.id } })
    );

    const left = await prisma.notification.findMany({
      where: { userId: testUser.id },
    });
    expect(left.length).toBe(0);
    expect(
      await prisma.notification.findUnique({ where: { id: otherNoti.id } })
    ).not.toBeNull();
  });

  /* ─────────── 관련 사용자 삭제 시 알림 유지 ─────────── */
  it("keeps notification if relatedUser is deleted (no @relation)", async () => {
    const noti = await prisma.notification.create({
      data: {
        userId: testUser.id,
        type: "MUTUAL_PROFILE_INTEREST",
        relatedUserId: relatedUser.id,
      },
    });

    await prisma.$transaction((tx) =>
      tx.user.delete({ where: { id: relatedUser.id } })
    );

    const found = await prisma.notification.findUnique({
      where: { id: noti.id },
    });
    expect(found).not.toBeNull();
    expect(found?.relatedUserId).toBe(relatedUser.id);
  });
});
