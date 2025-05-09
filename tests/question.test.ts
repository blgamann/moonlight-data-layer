// tests/question.spec.ts
import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient, Book } from "@prisma/client";

const prisma = new PrismaClient();

describe("Question Model (transactional)", () => {
  let testBook: Book;

  // 공통 정리
  beforeEach(async () => {
    await prisma.$transaction([
      prisma.answer.deleteMany(),
      prisma.question.deleteMany(),
      prisma.bookshelfEntry.deleteMany(),
      prisma.book.deleteMany(),
    ]);

    // 테스트용 Book 하나 생성
    testBook = await prisma.$transaction((tx) =>
      tx.book.create({
        data: {
          isbn: `isbn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          title: "Test Book for Questions",
          author: "Test Author",
          publisher: "Test Publisher",
        },
      })
    );
  });

  it("creates a new question for a book", async () => {
    const content = "이 책에서 가장 인상 깊었던 문장은 무엇인가요?";

    const question = await prisma.$transaction((tx) =>
      tx.question.create({
        data: { bookIsbn: testBook.isbn, content },
      })
    );

    expect(question.bookIsbn).toBe(testBook.isbn);

    const fetched = await prisma.question.findUnique({
      where: { id: question.id },
      include: { book: true },
    });
    expect(fetched?.book.title).toBe(testBook.title);
  });

  it("allows multiple questions for the same book", async () => {
    await prisma.$transaction(async (tx) => {
      await tx.question.create({
        data: { bookIsbn: testBook.isbn, content: "질문 1" },
      });
      await tx.question.create({
        data: { bookIsbn: testBook.isbn, content: "질문 2" },
      });
    });

    const qs = await prisma.question.findMany({
      where: { bookIsbn: testBook.isbn },
    });
    expect(qs.length).toBe(2);
  });

  it("finds questions by book ISBN", async () => {
    const content = "이 책의 주제는 무엇이라고 생각하시나요?";
    await prisma.question.create({
      data: { bookIsbn: testBook.isbn, content },
    });

    const otherBook = await prisma.book.create({
      data: {
        isbn: `isbn_other_${Date.now()}`,
        title: "Another Book",
        author: "Other Author",
        publisher: "Other Publisher",
      },
    });
    await prisma.question.create({
      data: { bookIsbn: otherBook.isbn, content: "다른 책 질문" },
    });

    const found = await prisma.question.findMany({
      where: { bookIsbn: testBook.isbn },
    });
    expect(found.length).toBe(1);
    expect(found[0].content).toBe(content);
  });

  it("updates a question's content", async () => {
    const original = await prisma.question.create({
      data: { bookIsbn: testBook.isbn, content: "초기 질문" },
    });

    const updated = await prisma.$transaction((tx) =>
      tx.question.update({
        where: { id: original.id },
        data: { content: "수정된 질문" },
      })
    );

    expect(updated.content).toBe("수정된 질문");
    expect(updated.updatedAt.getTime()).toBeGreaterThan(
      original.updatedAt.getTime()
    );
  });

  it("deletes a question", async () => {
    const q = await prisma.question.create({
      data: { bookIsbn: testBook.isbn, content: "삭제될 질문" },
    });

    await prisma.$transaction((tx) =>
      tx.question.delete({ where: { id: q.id } })
    );

    const shouldBeNull = await prisma.question.findUnique({
      where: { id: q.id },
    });
    expect(shouldBeNull).toBeNull();
  });

  it("cascades delete questions when a book is removed", async () => {
    await prisma.question.create({
      data: { bookIsbn: testBook.isbn, content: "Q1" },
    });
    await prisma.question.create({
      data: { bookIsbn: testBook.isbn, content: "Q2" },
    });

    await prisma.$transaction((tx) =>
      tx.book.delete({ where: { isbn: testBook.isbn } })
    );

    const remain = await prisma.question.findMany({
      where: { bookIsbn: testBook.isbn },
    });
    expect(remain.length).toBe(0);
  });
});
