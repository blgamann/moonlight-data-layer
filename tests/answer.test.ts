// tests/answer.spec.ts
import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient, User, Book, Question } from "@prisma/client";

const prisma = new PrismaClient();

describe("Answer Model (transactional)", () => {
  let testUser!: User;
  let testBook!: Book;
  let testQuestion!: Question;

  /** 공통 정리 + 기본 픽스처 */
  beforeEach(async () => {
    await prisma.$transaction([
      prisma.answerInterest.deleteMany(),
      prisma.answer.deleteMany(),
      prisma.question.deleteMany(),
      prisma.bookshelfEntry.deleteMany(),
      prisma.user.deleteMany(),
      prisma.book.deleteMany(),
    ]);

    const timestamp = Date.now();
    const suffix = Math.random().toString(36).slice(2, 7);

    // 기본 픽스처 생성도 한 번에
    [testUser, testBook, testQuestion] = await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: {
            email: `user_ans_${timestamp}_${suffix}@example.com`,
            passwordHash: "hashed_pw",
            name: "Test User",
          },
        });

        const book = await tx.book.create({
          data: {
            isbn: `isbn_ans_${timestamp}_${suffix}`,
            title: "Test Book",
            author: "Author",
            publisher: "Publisher",
          },
        });

        const question = await tx.question.create({
          data: {
            bookIsbn: book.isbn,
            content: "질문 내용?",
          },
        });

        return [user, book, question];
      }
    );
  });

  it("creates a new answer", async () => {
    const answer = await prisma.$transaction((tx) =>
      tx.answer.create({
        data: {
          userId: testUser.id,
          questionId: testQuestion.id,
          content: "감명 깊었습니다.",
        },
      })
    );

    expect(answer.content).toBe("감명 깊었습니다.");

    const fetched = await prisma.answer.findUnique({
      where: { id: answer.id },
      include: { user: true, question: true },
    });
    expect(fetched?.user.email).toBe(testUser.email);
    expect(fetched?.question.content).toBe(testQuestion.content);
  });

  it("allows answers from different users to same question", async () => {
    const anotherUser = await prisma.user.create({
      data: {
        email: `other_${Date.now()}@ex.com`,
        passwordHash: "pw",
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.answer.create({
        data: {
          userId: testUser.id,
          questionId: testQuestion.id,
          content: "A1",
        },
      });
      await tx.answer.create({
        data: {
          userId: anotherUser.id,
          questionId: testQuestion.id,
          content: "A2",
        },
      });
    });

    const list = await prisma.answer.findMany({
      where: { questionId: testQuestion.id },
    });
    expect(list.length).toBe(2);
  });

  it("allows same user to answer multiple questions", async () => {
    const q2 = await prisma.question.create({
      data: {
        bookIsbn: testBook.isbn,
        content: "다른 질문",
      },
    });

    await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: testQuestion.id,
        content: "첫 답",
      },
    });
    await prisma.answer.create({
      data: { userId: testUser.id, questionId: q2.id, content: "둘째 답" },
    });

    const answers = await prisma.answer.findMany({
      where: { userId: testUser.id },
    });
    expect(answers.length).toBe(2);
  });

  it("finds answers by questionId", async () => {
    await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: testQuestion.id,
        content: "특정 답",
      },
    });
    const otherQ = await prisma.question.create({
      data: { bookIsbn: testBook.isbn, content: "다른 Q" },
    });
    await prisma.answer.create({
      data: { userId: testUser.id, questionId: otherQ.id, content: "무시" },
    });

    const found = await prisma.answer.findMany({
      where: { questionId: testQuestion.id },
    });
    expect(found.length).toBe(1);
    expect(found[0].content).toBe("특정 답");
  });

  it("finds answers by userId", async () => {
    await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: testQuestion.id,
        content: "내 답변",
      },
    });
    const otherUser = await prisma.user.create({
      data: { email: `x_${Date.now()}@ex.com`, passwordHash: "pw" },
    });
    await prisma.answer.create({
      data: {
        userId: otherUser.id,
        questionId: testQuestion.id,
        content: "남의 답",
      },
    });

    const mine = await prisma.answer.findMany({
      where: { userId: testUser.id },
    });
    expect(mine.length).toBe(1);
    expect(mine[0].content).toBe("내 답변");
  });

  it("updates an answer's content", async () => {
    const original = await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: testQuestion.id,
        content: "초기",
      },
    });

    const updated = await prisma.$transaction((tx) =>
      tx.answer.update({
        where: { id: original.id },
        data: { content: "수정됨" },
      })
    );

    expect(updated.content).toBe("수정됨");
  });

  it("deletes an answer", async () => {
    const a = await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: testQuestion.id,
        content: "삭제 대상",
      },
    });

    await prisma.$transaction((tx) =>
      tx.answer.delete({ where: { id: a.id } })
    );

    const shouldBeNull = await prisma.answer.findUnique({
      where: { id: a.id },
    });
    expect(shouldBeNull).toBeNull();
  });

  it("cascades delete on user removal", async () => {
    await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: testQuestion.id,
        content: "연쇄",
      },
    });

    await prisma.$transaction((tx) =>
      tx.user.delete({ where: { id: testUser.id } })
    );

    const remains = await prisma.answer.findMany({
      where: { userId: testUser.id },
    });
    expect(remains.length).toBe(0);
  });

  it("cascades delete on question removal", async () => {
    await prisma.answer.create({
      data: {
        userId: testUser.id,
        questionId: testQuestion.id,
        content: "연쇄2",
      },
    });

    await prisma.$transaction((tx) =>
      tx.question.delete({ where: { id: testQuestion.id } })
    );

    const remains = await prisma.answer.findMany({
      where: { questionId: testQuestion.id },
    });
    expect(remains.length).toBe(0);
  });
});
