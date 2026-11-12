import { expect, mock, test } from "bun:test";
import { pageFetchOf } from "./page-fetch";

const URL_ASKED = new URL("https://myfigurecollection.net/");
const ANSWER = new Response();

test("Chrome has no content window, so the script's own fetch runs", async () => {
  const own = mock(async () => ANSWER);

  await pageFetchOf({}, own)(URL_ASKED, {});

  expect(own).toHaveBeenCalledTimes(1);
});

test("an MFC element with the id content does not pass for Firefox's content window", async () => {
  const own = mock(async () => ANSWER);
  const element = {};

  await pageFetchOf({ content: element }, own)(URL_ASKED, {});

  expect(own).toHaveBeenCalledTimes(1);
});

test("Firefox's content window fetches as the page, called on that window", async () => {
  const own = mock(async () => ANSWER);
  const content = {
    answer: ANSWER,
    fetch(this: { readonly answer: Response }) {
      return Promise.resolve(this.answer);
    },
  };

  expect(await pageFetchOf({ content }, own)(URL_ASKED, {})).toBe(ANSWER);
  expect(own).not.toHaveBeenCalled();
});
