import { describe, expect, it } from "vitest";
import { parseKeywordRows } from "./parseKeywordRows";

describe("parseKeywordRows", () => {
  it("열 순서와 공백에 상관없이 키워드를 읽습니다", () => {
    expect(parseKeywordRows([
      [" 설명 ", " 키워드 ", " 영역 "],
      [" 가상 서버 ", " EC2 ", " 컴퓨팅 "],
    ])).toEqual({
      ok: true,
      groups: [{ category: "컴퓨팅", entries: [{ keyword: "EC2", description: "가상 서버" }] }],
    });
  });

  it("설명 열이 없으면 빈 문자열을 사용합니다", () => {
    expect(parseKeywordRows([["영역", "키워드"], ["컴퓨팅", "EC2"]])).toEqual({
      ok: true,
      groups: [{ category: "컴퓨팅", entries: [{ keyword: "EC2", description: "" }] }],
    });
  });

  it("빈 행과 영역 또는 키워드가 비어 있는 행을 건너뜁니다", () => {
    expect(parseKeywordRows([
      ["영역", "키워드", "설명"],
      [],
      [" ", "EC2", "가상 서버"],
      ["컴퓨팅", " ", "가상 서버"],
      ["컴퓨팅"],
      ["스토리지", "S3"],
    ])).toEqual({
      ok: true,
      groups: [{ category: "스토리지", entries: [{ keyword: "S3", description: "" }] }],
    });
  });

  it.each([["설명", "키워드"], ["영역", "설명"]])(
    "필수 헤더가 빠진 경우 한국어 오류를 반환합니다 (%s, %s)",
    (first, second) => {
      expect(parseKeywordRows([[first, second]])).toEqual({
        ok: false,
        error: "'영역', '키워드' 헤더를 찾을 수 없습니다.",
      });
    },
  );

  it("떨어진 영역을 묶고 그룹과 키워드의 입력 순서 및 중복을 유지합니다", () => {
    expect(parseKeywordRows([
      ["영역", "키워드", "설명"],
      ["2", "EC2"],
      ["1", "S3"],
      ["2", "Lambda"],
      ["2", "EC2", "가상 서버"],
    ])).toEqual({
      ok: true,
      groups: [
        {
          category: "2",
          entries: [
            { keyword: "EC2", description: "" },
            { keyword: "Lambda", description: "" },
            { keyword: "EC2", description: "가상 서버" },
          ],
        },
        { category: "1", entries: [{ keyword: "S3", description: "" }] },
      ],
    });
  });

  it("시트가 비었거나 올바른 헤더만 있으면 빈 그룹 목록을 반환합니다", () => {
    expect(parseKeywordRows([])).toEqual({ ok: true, groups: [] });
    expect(parseKeywordRows([["영역", "키워드"]])).toEqual({ ok: true, groups: [] });
  });

  it("분류를 영역 헤더로 인식합니다", () => {
    expect(parseKeywordRows([["분류", "키워드"], ["컴퓨팅", "EC2"]])).toEqual({
      ok: true,
      groups: [{ category: "컴퓨팅", entries: [{ keyword: "EC2", description: "" }] }],
    });
  });

  it("상속 속성과 이름이 같은 헤더와 영역을 안전하게 처리합니다", () => {
    expect(parseKeywordRows([
      ["__proto__", "영역", "키워드", "toString"],
      ["메모", "__proto__", "EC2", "메모"],
      ["메모", "toString", "S3", "메모"],
    ])).toEqual({
      ok: true,
      groups: [
        { category: "__proto__", entries: [{ keyword: "EC2", description: "" }] },
        { category: "toString", entries: [{ keyword: "S3", description: "" }] },
      ],
    });
  });
});
