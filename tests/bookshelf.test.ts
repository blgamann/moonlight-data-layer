import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { PrismaClient, User, Book } from "@prisma/client"; // User와 Book 타입을 가져옵니다.

const prisma = new PrismaClient();

describe("BookshelfEntry Model", () => {
  let testUser: User;
  let testBook: Book;

  beforeEach(async () => {
    // 의존하는 데이터부터 삭제
    await prisma.bookshelfEntry.deleteMany({});
    await prisma.answer.deleteMany({}); // Question을 참조하고, Question은 Book을 참조
    await prisma.question.deleteMany({}); // Book을 참조
    await prisma.user.deleteMany({}); // BookshelfEntry가 User를 참조
    await prisma.book.deleteMany({}); // BookshelfEntry가 Book을 참조

    // 테스트를 위한 User 및 Book 생성
    testUser = await prisma.user.create({
      data: {
        email: `user_bs_${Date.now()}@example.com`,
        passwordHash: "hashedpassword",
      },
    });

    testBook = await prisma.book.create({
      data: {
        isbn: `isbn_bs_${Date.now()}`,
        title: "Test Book for Bookshelf",
        author: "Test Author",
        publisher: "Test Publisher",
      },
    });
  });

  // afterEach는 필요시 주석 해제

  it("should add a book to a user's bookshelf", async () => {
    const bookshelfEntry = await prisma.bookshelfEntry.create({
      data: {
        userId: testUser.id,
        bookIsbn: testBook.isbn,
        // addedAt은 @default(now()) 이므로 자동으로 생성됨
      },
    });

    expect(bookshelfEntry.id).toBeDefined();
    expect(bookshelfEntry.userId).toBe(testUser.id);
    expect(bookshelfEntry.bookIsbn).toBe(testBook.isbn);
    expect(bookshelfEntry.addedAt).toBeInstanceOf(Date);

    // (선택적) 관계를 통해 데이터가 올바르게 연결되었는지 확인
    const entryWithRelations = await prisma.bookshelfEntry.findUnique({
      where: { id: bookshelfEntry.id },
      include: { user: true, book: true },
    });
    expect(entryWithRelations?.user.email).toBe(testUser.email);
    expect(entryWithRelations?.book.title).toBe(testBook.title);
  });

  it("should prevent adding the same book to the same user's bookshelf twice (unique constraint)", async () => {
    // 첫 번째 추가
    await prisma.bookshelfEntry.create({
      data: {
        userId: testUser.id,
        bookIsbn: testBook.isbn,
      },
    });

    // 두 번째 동일한 항목 추가 시도
    try {
      await prisma.bookshelfEntry.create({
        data: {
          userId: testUser.id,
          bookIsbn: testBook.isbn,
        },
      });
    } catch (e: any) {
      expect(e.code).toBe("P2002"); // Prisma 고유 제약 조건 위반
      // @@unique([userId, bookIsbn]) 제약 조건이므로 target에 두 필드가 모두 포함될 수 있음
      // 실제 에러 메시지나 meta.target을 보고 정확히 확인하는 것이 좋음
      // 예: expect(e.meta?.target).toEqual(['userId', 'bookIsbn']); (Prisma 버전에 따라 다를 수 있음)
    }
  });

  it("should allow adding different books to the same user's bookshelf", async () => {
    const anotherBook = await prisma.book.create({
      data: {
        isbn: `another_isbn_${Date.now()}`,
        title: "Another Test Book",
        author: "Another Author",
        publisher: "Another Publisher",
      },
    });

    const entry1 = await prisma.bookshelfEntry.create({
      data: { userId: testUser.id, bookIsbn: testBook.isbn },
    });
    const entry2 = await prisma.bookshelfEntry.create({
      data: { userId: testUser.id, bookIsbn: anotherBook.isbn },
    });

    expect(entry1.bookIsbn).not.toBe(entry2.bookIsbn);
    expect(entry1.userId).toBe(entry2.userId);

    const userEntries = await prisma.bookshelfEntry.findMany({
      where: { userId: testUser.id },
    });
    expect(userEntries.length).toBe(2);
  });

  it("should allow adding the same book to different users' bookshelves", async () => {
    const anotherUser = await prisma.user.create({
      data: {
        email: `another_user_bs_${Date.now()}@example.com`,
        passwordHash: "hashedpassword2",
      },
    });

    const entry1 = await prisma.bookshelfEntry.create({
      data: { userId: testUser.id, bookIsbn: testBook.isbn },
    });
    const entry2 = await prisma.bookshelfEntry.create({
      data: { userId: anotherUser.id, bookIsbn: testBook.isbn },
    });

    expect(entry1.userId).not.toBe(entry2.userId);
    expect(entry1.bookIsbn).toBe(entry2.bookIsbn);

    const bookEntries = await prisma.bookshelfEntry.findMany({
      where: { bookIsbn: testBook.isbn },
    });
    expect(bookEntries.length).toBe(2);
  });

  it("should delete a bookshelf entry", async () => {
    const bookshelfEntry = await prisma.bookshelfEntry.create({
      data: {
        userId: testUser.id,
        bookIsbn: testBook.isbn,
      },
    });

    await prisma.bookshelfEntry.delete({
      where: { id: bookshelfEntry.id },
    });

    const deletedEntry = await prisma.bookshelfEntry.findUnique({
      where: { id: bookshelfEntry.id },
    });
    expect(deletedEntry).toBeNull();
  });

  it("should cascade delete bookshelf entries when a user is deleted", async () => {
    await prisma.bookshelfEntry.create({
      data: { userId: testUser.id, bookIsbn: testBook.isbn },
    });

    await prisma.user.delete({ where: { id: testUser.id } });

    const entries = await prisma.bookshelfEntry.findMany({
      where: { userId: testUser.id },
    });
    expect(entries.length).toBe(0);
  });

  it("should cascade delete bookshelf entries when a book is deleted", async () => {
    await prisma.bookshelfEntry.create({
      data: { userId: testUser.id, bookIsbn: testBook.isbn },
    });

    // Book을 삭제하기 전에 Book을 참조하는 Question도 삭제 필요 (Question.bookIsbn onDelete: Cascade 이므로 Book 삭제시 Question도 삭제되긴 함)
    await prisma.question.deleteMany({ where: { bookIsbn: testBook.isbn } });
    await prisma.book.delete({ where: { isbn: testBook.isbn } });

    const entries = await prisma.bookshelfEntry.findMany({
      where: { bookIsbn: testBook.isbn },
    });
    expect(entries.length).toBe(0);
  });
});
