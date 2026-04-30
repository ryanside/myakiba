import * as React from "react";
import { Command as CommandPrimitive } from "cmdk";

import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { HugeiconsIcon } from "@hugeicons/react";
import { SearchIcon, Tick02Icon } from "@hugeicons/core-free-icons";

function Command({ className, ...props }: React.ComponentProps<typeof CommandPrimitive>) {
  return (
    <CommandPrimitive
      data-slot="command"
      className={cn(
        "flex size-full flex-col overflow-hidden rounded-xl! bg-popover p-1 text-popover-foreground",
        "in-data-[slot=dialog-content]:bg-transparent in-data-[slot=dialog-content]:p-0",
        className,
      )}
      {...props}
    />
  );
}

function CommandDialog({
  title = "Command Palette",
  description = "Search for a command to run...",
  children,
  className,
  showCloseButton = false,
  ...props
}: Omit<React.ComponentProps<typeof Dialog>, "children"> & {
  title?: string;
  description?: string;
  className?: string;
  showCloseButton?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Dialog {...props}>
      <DialogHeader className="sr-only">
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      <DialogContent
        className={cn(
          "top-1/2 -translate-y-1/2 overflow-hidden rounded-xl! p-0",
          "bg-background/80 ring-1 ring-foreground/10 backdrop-blur-sm",
          className,
        )}
        showCloseButton={showCloseButton}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

function CommandInput({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Input>) {
  return (
    <div data-slot="command-input-wrapper" className="p-1 pb-0 in-data-[slot=dialog-content]:p-0">
      <InputGroup
        className={cn(
          "h-8! rounded-lg! border-border/40 bg-background/90 shadow-none! *:data-[slot=input-group-addon]:pl-2!",
          "in-data-[slot=dialog-content]:h-12! in-data-[slot=dialog-content]:rounded-none! in-data-[slot=dialog-content]:border-0 in-data-[slot=dialog-content]:border-b in-data-[slot=dialog-content]:border-foreground/10 in-data-[slot=dialog-content]:bg-transparent! in-data-[slot=dialog-content]:has-[[data-slot=input-group-control]:focus-visible]:border-foreground/10 in-data-[slot=dialog-content]:has-[[data-slot=input-group-control]:focus-visible]:ring-0 in-data-[slot=dialog-content]:*:data-[slot=input-group-addon]:pl-4!",
        )}
      >
        <CommandPrimitive.Input
          data-slot="command-input"
          className={cn(
            "w-full text-sm outline-hidden disabled:cursor-not-allowed disabled:opacity-50",
            "in-data-[slot=dialog-content]:pr-4 in-data-[slot=dialog-content]:text-[15px] in-data-[slot=dialog-content]:placeholder:text-muted-foreground/70",
            className,
          )}
          {...props}
        />
        <InputGroupAddon>
          <HugeiconsIcon
            icon={SearchIcon}
            strokeWidth={2}
            className="size-4 shrink-0 opacity-50 in-data-[slot=dialog-content]:size-[1.1rem] in-data-[slot=dialog-content]:opacity-60"
          />
        </InputGroupAddon>
      </InputGroup>
    </div>
  );
}

function CommandList({
  className,
  hideScrollbar = true,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.List> & {
  hideScrollbar?: boolean;
}) {
  return (
    <CommandPrimitive.List
      data-slot="command-list"
      className={cn(
        "max-h-72 scroll-py-1 overflow-x-hidden overflow-y-auto outline-none",
        hideScrollbar && "no-scrollbar",
        className,
      )}
      {...props}
    />
  );
}

function CommandEmpty({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Empty>) {
  return (
    <CommandPrimitive.Empty
      data-slot="command-empty"
      className={cn("py-6 text-center text-sm", className)}
      {...props}
    />
  );
}

function CommandGroup({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Group>) {
  return (
    <CommandPrimitive.Group
      data-slot="command-group"
      className={cn(
        "overflow-hidden p-1 text-foreground **:[[cmdk-group-heading]]:px-2 **:[[cmdk-group-heading]]:py-1.5 **:[[cmdk-group-heading]]:text-xs **:[[cmdk-group-heading]]:font-medium **:[[cmdk-group-heading]]:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandSeparator({
  className,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Separator>) {
  return (
    <CommandPrimitive.Separator
      data-slot="command-separator"
      className={cn("-mx-1 h-px bg-border", className)}
      {...props}
    />
  );
}

function CommandItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof CommandPrimitive.Item>) {
  return (
    <CommandPrimitive.Item
      data-slot="command-item"
      className={cn(
        "group/command-item relative flex cursor-default items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden select-none in-data-[slot=dialog-content]:rounded-lg! data-[disabled=true]:pointer-events-none data-[disabled=true]:opacity-50 data-selected:bg-muted data-selected:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 data-selected:*:[svg]:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
      <HugeiconsIcon
        icon={Tick02Icon}
        strokeWidth={2}
        className="ml-auto opacity-0 group-has-data-[slot=command-shortcut]/command-item:hidden group-data-[checked=true]/command-item:opacity-100"
      />
    </CommandPrimitive.Item>
  );
}

function CommandShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="command-shortcut"
      className={cn(
        "ml-auto text-xs font-normal text-muted-foreground group-data-selected/command-item:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="command-footer"
      className={cn(
        "flex h-12 items-center gap-5 border-t border-foreground/10 px-4 text-xs text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}

function CommandFooterHint({
  className,
  keys,
  label,
  ...props
}: React.ComponentProps<"div"> & {
  readonly keys: readonly string[];
  readonly label: string;
}) {
  return (
    <div
      data-slot="command-footer-hint"
      className={cn("flex items-center gap-1.5", className)}
      {...props}
    >
      <span className="flex items-center gap-0.5">
        {keys.map((key) => (
          <CommandKey key={key}>{key}</CommandKey>
        ))}
      </span>
      <span>{label}</span>
    </div>
  );
}

function CommandKey({ className, ...props }: React.ComponentProps<"kbd">) {
  return (
    <kbd
      data-slot="command-key"
      className={cn(
        "inline-flex h-5 min-w-5 items-center justify-center rounded-[calc(var(--radius)-5px)] bg-background/90 px-1 font-sans text-[10px] font-medium text-foreground/80 ring-1 ring-foreground/10 backdrop-blur-xs",
        className,
      )}
      {...props}
    />
  );
}

export {
  Command,
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandShortcut,
  CommandSeparator,
  CommandFooter,
  CommandFooterHint,
  CommandKey,
};
