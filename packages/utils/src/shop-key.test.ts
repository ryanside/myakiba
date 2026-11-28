import { expect, test } from "bun:test";
import { shopKey } from "./shop-key";

test.each([
  ["AmiAmi", "amiami"],
  ["AMIAMI", "amiami"],
  ["  amiami  ", "amiami"],
  ["Ami Ami", "amiami"],
  ["Ami　Ami", "amiami"],
  ["ＡｍｉＡｍｉ", "amiami"],
  ["amiami.com", "amiami"],
  ["AmiAmi .COM", "amiami"],
  ["hlj.net", "hlj"],
  ["solaris.org", "solaris"],
  ["nippon-yasan.shop", "nippon-yasan"],
  ["figure.store", "figure"],
  ["Good Smile Company", "goodsmilecompany"],
  ["ｱﾐｱﾐ", "アミアミ"],
])("%j has the key %j", (shop, key) => {
  expect(shopKey(shop)).toBe(key);
});

test.each([
  ["www.amiami.com", "AmiAmi"],
  ["https://www.amiami.com/", "AmiAmi"],
  ["amiami.com/eng", "AmiAmi"],
  ["amiami.jp", "AmiAmi"],
  ["amiami.co.jp", "AmiAmi"],
  ["amiami.com.com", "AmiAmi"],
  ["Ami-Ami", "AmiAmi"],
  ["Ami.Ami", "AmiAmi"],
  ["GoodSmile", "Good Smile Company"],
  ["GoodSmile US", "GoodSmile"],
  ["HobbyLink Japan", "HLJ"],
  ["アミアミ", "あみあみ"],
  ["あみあみ", "AmiAmi"],
  ["Mandarake", "mandarake.co.jp"],
  ["amazon.co.jp", "amazon.com"],
  ["market.example/seller.com", "market.example/seller"],
])("%j and %j are different Shops", (a, b) => {
  expect(shopKey(a)).not.toBe(shopKey(b));
});

test.each([[""], ["   "]])("%j has no key", (shop) => {
  expect(shopKey(shop)).toBe("");
});

test("a suffix with no name before it stays", () => {
  expect(shopKey(".com")).toBe(".com");
});
