// tests/answer-interest.spec.ts
import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient, User, Book, Question, Answer } from "@prisma/client";

const prisma = new PrismaClient();

describe("AnswerInterest Model (transactional)", () => {
  let interestedUser!: User;
  let answerAuthor!: User;
  let testBook!: Book;
  let testQuestion!: Question;
  let targetAnswer!: Answer;

  /** 공통 초기화 */
  beforeEach(async () => {
    await prisma.$transaction([
      prisma.answerInterest.deleteMany(),
      prisma.answer.deleteMany(),
      prisma.question.deleteMany(),
      prisma.bookshelfEntry.deleteMany(),
      prisma.profileInterest.deleteMany(),
      prisma.soullinkRequest.deleteMany(),
      prisma.soulmate.deleteMany(),
      prisma.notification.deleteMany(),
      prisma.user.deleteMany(),
      prisma.book.deleteMany(),
    ]);

    const ts = Date.now();

    // 기본 픽스처 생성
    [interestedUser, answerAuthor, testBook, testQuestion, targetAnswer] =
      await prisma.$transaction(async (tx) => {
        const iu = await tx.user.create({
          data: {
            email: `interested_${ts}@ex.com`,
            passwordHash: "pw1",
          },
        });

        const au = await tx.user.create({
          data: {
            email: `author_${ts}@ex.com`,
            passwordHash: "pw2",
          },
        });

        const book = await tx.book.create({
          data: {
            isbn: `isbn_ai_${ts}`,
            title: "Book",
            author: "Author",
            publisher: "Pub",
          },
        });

        const q = await tx.question.create({
          data: {
            bookIsbn: book.isbn,
            content: "질문?",
          },
        });

        const ans = await tx.answer.create({
          data: {
            userId: au.id,
            questionId: q.id,
            content: "답변",
          },
        });

        return [iu, au, book, q, ans];
      });
  });

  it("creates an AnswerInterest", async () => {
    const ai = await prisma.$transaction((tx) =>
      tx.answerInterest.create({
        data: {
          interestedUserId: interestedUser.id,
          targetAnswerId: targetAnswer.id,
        },
      })
    );

    expect(ai.interestedUserId).toBe(interestedUser.id);

    const withRelations = await prisma.answerInterest.findUnique({
      where: { id: ai.id },
      include: {
        interestedUser: true,
        targetAnswer: { include: { user: true } },
      },
    });

    expect(withRelations?.targetAnswer.user.email).toBe(answerAuthor.email);
  });

  it("blocks duplicate (interestedUserId, targetAnswerId)", async () => {
    await prisma.answerInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetAnswerId: targetAnswer.id,
      },
    });

    await expect(
      prisma.answerInterest.create({
        data: {
          interestedUserId: interestedUser.id,
          targetAnswerId: targetAnswer.id,
        },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("allows different users for same answer", async () => {
    const otherUser = await prisma.user.create({
      data: { email: `other_${Date.now()}@ex.com`, passwordHash: "pw" },
    });

    await prisma.$transaction(async (tx) => {
      await tx.answerInterest.create({
        data: {
          interestedUserId: interestedUser.id,
          targetAnswerId: targetAnswer.id,
        },
      });
      await tx.answerInterest.create({
        data: {
          interestedUserId: otherUser.id,
          targetAnswerId: targetAnswer.id,
        },
      });
    });

    const list = await prisma.answerInterest.findMany({
      where: { targetAnswerId: targetAnswer.id },
    });
    expect(list.length).toBe(2);
  });

  it("allows same user for different answers", async () => {
    const anotherAnswer = await prisma.answer.create({
      data: {
        userId: answerAuthor.id,
        questionId: testQuestion.id,
        content: "다른 답변",
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.answerInterest.create({
        data: {
          interestedUserId: interestedUser.id,
          targetAnswerId: targetAnswer.id,
        },
      });
      await tx.answerInterest.create({
        data: {
          interestedUserId: interestedUser.id,
          targetAnswerId: anotherAnswer.id,
        },
      });
    });

    const mine = await prisma.answerInterest.findMany({
      where: { interestedUserId: interestedUser.id },
    });
    expect(mine.length).toBe(2);
  });

  it("deletes an AnswerInterest", async () => {
    const ai = await prisma.answerInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetAnswerId: targetAnswer.id,
      },
    });

    await prisma.$transaction((tx) =>
      tx.answerInterest.delete({ where: { id: ai.id } })
    );

    const shouldBeNull = await prisma.answerInterest.findUnique({
      where: { id: ai.id },
    });
    expect(shouldBeNull).toBeNull();
  });

  it("cascades on interested user delete", async () => {
    await prisma.answerInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetAnswerId: targetAnswer.id,
      },
    });

    await prisma.$transaction((tx) =>
      tx.user.delete({ where: { id: interestedUser.id } })
    );

    const remains = await prisma.answerInterest.findMany({
      where: { interestedUserId: interestedUser.id },
    });
    expect(remains.length).toBe(0);
  });

  it("cascades on target answer delete", async () => {
    await prisma.answerInterest.create({
      data: {
        interestedUserId: interestedUser.id,
        targetAnswerId: targetAnswer.id,
      },
    });

    await prisma.$transaction((tx) =>
      tx.answer.delete({ where: { id: targetAnswer.id } })
    );

    const remains = await prisma.answerInterest.findMany({
      where: { targetAnswerId: targetAnswer.id },
    });
    expect(remains.length).toBe(0);
  });

  it("allows interest in own answer (policy-dependent)", async () => {
    const ai = await prisma.$transaction((tx) =>
      tx.answerInterest.create({
        data: {
          interestedUserId: answerAuthor.id,
          targetAnswerId: targetAnswer.id,
        },
      })
    );
    expect(ai.interestedUserId).toBe(answerAuthor.id);
  });
});
