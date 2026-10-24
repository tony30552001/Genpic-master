import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

export const chooseOption = async (label, optionName) => {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText(label));
  await user.click(await screen.findByRole("option", { name: optionName }));
};

export const listOptions = async (label) => {
  const user = userEvent.setup();
  await user.click(screen.getByLabelText(label));
  const listbox = await screen.findByRole("listbox");
  const names = within(listbox).queryAllByRole("option").map((option) => option.textContent);
  await user.keyboard("{Escape}");
  return names;
};
