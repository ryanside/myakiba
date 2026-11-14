import { afterEach, expect, mock, test } from "bun:test";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ChipsInput } from "./chips-input";
import { Dialog, DialogContent, DialogTitle } from "./dialog";

afterEach(cleanup);

const TAGS = ["Favorite", "fan art", "limited"];
const suggest = (query: string) =>
  TAGS.filter((tag) => tag.toLowerCase().includes(query.toLowerCase()));

const NO_TAGS: readonly string[] = [];
const ignore = () => {};

function TagsForm({
  initial = NO_TAGS,
  onSubmit = ignore,
}: {
  readonly initial?: readonly string[];
  readonly onSubmit?: () => void;
}) {
  const [tags, setTags] = useState<readonly string[]>(initial);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
    >
      <ChipsInput
        aria-label="Tags"
        noun="tag"
        values={tags}
        onValuesChange={setTags}
        suggest={suggest}
        maxValues={3}
        maxLength={12}
      />
      <output aria-label="Saved">{JSON.stringify(tags)}</output>
    </form>
  );
}

const field = () => screen.getByRole<HTMLInputElement>("combobox", { name: "Tags" });
const saved = () => screen.getByLabelText("Saved").textContent;

test("Enter adds the typed value, trimmed but otherwise as typed, without submitting the form", async () => {
  const onSubmit = mock(() => {});
  render(<TagsForm onSubmit={onSubmit} />);
  const user = userEvent.setup();

  await user.type(field(), "  fav orite {Enter}");

  expect(saved()).toBe('["fav orite"]');
  expect(field().value).toBe("");
  expect(onSubmit).not.toHaveBeenCalled();
});

test("picking a suggestion adds its spelling, and a chosen value is not suggested again", async () => {
  render(<TagsForm />);
  const user = userEvent.setup();

  await user.type(field(), "fav");
  await user.click(await screen.findByRole("option", { name: "Favorite" }));
  expect(saved()).toBe('["Favorite"]');
  expect(field().value).toBe("");

  await user.type(field(), "a");
  const options = await screen.findAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual(["fan art"]);
});

test("Enter on a highlighted suggestion adds that suggestion", async () => {
  render(<TagsForm />);
  const user = userEvent.setup();

  await user.type(field(), "lim");
  await screen.findByRole("option", { name: "limited" });
  await user.keyboard("{ArrowDown}{Enter}");

  expect(saved()).toBe('["limited"]');
});

test("ignores blank and repeated values", async () => {
  render(<TagsForm initial={["mine"]} />);
  const user = userEvent.setup();

  await user.type(field(), "   {Enter}mine{Enter}");

  expect(saved()).toBe('["mine"]');
});

test("stops taking values at the limit and caps their length", async () => {
  render(<TagsForm initial={["a", "b"]} />);
  const user = userEvent.setup();

  expect(field().maxLength).toBe(12);
  await user.type(field(), "c{Enter}");

  expect(saved()).toBe('["a","b","c"]');
  expect(field().readOnly).toBe(true);
  await user.type(field(), "d{Enter}");
  expect(saved()).toBe('["a","b","c"]');
});

test("at the limit, removing a chip focuses the field at once", async () => {
  render(<TagsForm initial={["a", "b", "c"]} />);

  fireEvent.click(screen.getByRole("button", { name: "Remove tag b" }));

  expect(document.activeElement).toBe(field());
  expect(saved()).toBe('["a","c"]');
});

test("Backspace in an empty field removes the last chip, and not while text remains", async () => {
  render(<TagsForm initial={["a", "b"]} />);
  const user = userEvent.setup();

  await user.type(field(), "x{Backspace}");
  expect(saved()).toBe('["a","b"]');

  await user.keyboard("{Backspace}");
  expect(saved()).toBe('["a"]');
});

test("each chip's remove button names its value", async () => {
  render(<TagsForm initial={["a", "b"]} />);
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Remove tag a" }));

  expect(saved()).toBe('["b"]');
});

test("Enter that confirms IME composition adds nothing and picks nothing", async () => {
  render(<TagsForm />);
  const user = userEvent.setup();

  await user.type(field(), "fav");
  await screen.findByRole("option", { name: "Favorite" });
  await user.keyboard("{ArrowDown}");
  fireEvent.keyDown(field(), { key: "Enter", isComposing: true });
  fireEvent.keyDown(field(), { key: "Enter", keyCode: 229 });

  expect(saved()).toBe("[]");
  expect(field().value).toBe("fav");
});

test("after Enter adds a value the list stays closed until more is typed", async () => {
  render(<TagsForm />);
  const user = userEvent.setup();

  await user.type(field(), "new{Enter}");

  expect(saved()).toBe('["new"]');
  expect(screen.queryByRole("option")).toBeNull();

  await user.type(field(), "fa");
  const options = await screen.findAllByRole("option");
  expect(options.map((option) => option.textContent)).toEqual(["Favorite", "fan art"]);
});

test("an empty field suggests nothing, so the list never covers what sits below it", async () => {
  render(<TagsForm />);
  const user = userEvent.setup();

  await user.click(field());

  expect(screen.queryByRole("option")).toBeNull();
});

test("removing a chip inside a dialog puts focus back in the field", async () => {
  function DialogTags() {
    const [tags, setTags] = useState<readonly string[]>(["a", "b"]);
    return (
      <Dialog open>
        <DialogContent>
          <DialogTitle>Edit</DialogTitle>
          <ChipsInput
            aria-label="Tags"
            noun="tag"
            values={tags}
            onValuesChange={setTags}
            suggest={suggest}
            maxValues={3}
            maxLength={12}
          />
        </DialogContent>
      </Dialog>
    );
  }
  render(<DialogTags />);
  const user = userEvent.setup();

  await user.click(screen.getByRole("button", { name: "Remove tag a" }));
  await new Promise((resolve) => {
    requestAnimationFrame(resolve);
  });

  expect(document.activeElement).toBe(field());
});
