// tests/bookshelf-entry.spec.ts
import { describe, it, expect, beforeEach } from "vitest";
import { PrismaClient, User, Book } from "@prisma/client";

const prisma = new PrismaClient();

describe("BookshelfEntry Model (transactional)", () => {
  let testUser!: User;
  let testBook!: Book;

  /** 공통 정리 + 테스트 픽스처 */
  beforeEach(async () => {
    await prisma.$transaction([
      prisma.bookshelfEntry.deleteMany(),
      prisma.answer.deleteMany(),
      prisma.question.deleteMany(),
      prisma.user.deleteMany(),
      prisma.book.deleteMany(),
    ]);

    const ts = Date.now();

    // 한 트랜잭션에서 User·Book 생성
    [testUser, testBook] = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: `user_bs_${ts}@example.com`,
          passwordHash: "hashed_pw",
        },
      });

      const book = await tx.book.create({
        data: {
          isbn: `isbn_bs_${ts}`,
          title: "Test Book",
          author: "Author",
          publisher: "Publisher",
        },
      });

      return [user, book];
    });
  });

  it("adds a book to user's bookshelf", async () => {
    const entry = await prisma.$transaction((tx) =>
      tx.bookshelfEntry.create({
        data: { userId: testUser.id, bookIsbn: testBook.isbn },
      })
    );

    expect(entry.userId).toBe(testUser.id);

    const withRelations = await prisma.bookshelfEntry.findUnique({
      where: { id: entry.id },
      include: { user: true, book: true },
    });
    expect(withRelations?.book.title).toBe(testBook.title);
  });

  it("blocks duplicate (userId, bookIsbn)", async () => {
    await prisma.bookshelfEntry.create({
      data: { userId: testUser.id, bookIsbn: testBook.isbn },
    });

    await expect(
      prisma.bookshelfEntry.create({
        data: { userId: testUser.id, bookIsbn: testBook.isbn },
      })
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("allows same user to add different books", async () => {
    const anotherBook = await prisma.book.create({
      data: {
        isbn: `isbn_other_${Date.now()}`,
        title: "Another Book",
        author: "Author2",
        publisher: "Pub2",
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.bookshelfEntry.create({
        data: { userId: testUser.id, bookIsbn: testBook.isbn },
      });
      await tx.bookshelfEntry.create({
        data: { userId: testUser.id, bookIsbn: anotherBook.isbn },
      });
    });

    const list = await prisma.bookshelfEntry.findMany({
      where: { userId: testUser.id },
    });
    expect(list.length).toBe(2);
  });

  it("allows same book for different users", async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: `other_${Date.now()}@ex.com`,
        passwordHash: "pw",
      },
    });

    await prisma.$transaction(async (tx) => {
      await tx.bookshelfEntry.create({
        data: { userId: testUser.id, bookIsbn: testBook.isbn },
      });
      await tx.bookshelfEntry.create({
        data: { userId: otherUser.id, bookIsbn: testBook.isbn },
      });
    });

    const entries = await prisma.bookshelfEntry.findMany({
      where: { bookIsbn: testBook.isbn },
    });
    expect(entries.length).toBe(2);
  });

  it("deletes a bookshelf entry", async () => {
    const entry = await prisma.bookshelfEntry.create({
      data: { userId: testUser.id, bookIsbn: testBook.isbn },
    });

    await prisma.$transaction((tx) =>
      tx.bookshelfEntry.delete({ where: { id: entry.id } })
    );

    const shouldBeNull = await prisma.bookshelfEntry.findUnique({
      where: { id: entry.id },
    });
    expect(shouldBeNull).toBeNull();
  });

  it("cascades on user delete", async () => {
    await prisma.bookshelfEntry.create({
      data: { userId: testUser.id, bookIsbn: testBook.isbn },
    });

    await prisma.$transaction((tx) =>
      tx.user.delete({ where: { id: testUser.id } })
    );

    const remains = await prisma.bookshelfEntry.findMany({
      where: { userId: testUser.id },
    });
    expect(remains.length).toBe(0);
  });

  it("cascades on book delete", async () => {
    await prisma.bookshelfEntry.create({
      data: { userId: testUser.id, bookIsbn: testBook.isbn },
    });

    await prisma.$transaction((tx) =>
      tx.book.delete({ where: { isbn: testBook.isbn } })
    );

    const remains = await prisma.bookshelfEntry.findMany({
      where: { bookIsbn: testBook.isbn },
    });
    expect(remains.length).toBe(0);
  });
});
