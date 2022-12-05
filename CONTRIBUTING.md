# CONTRIBUTING

## Pull Request Guidelines

- **All development should be done in `develop` branches.**

- Checkout a topic branch from the relevant branch, e.g. `develop`, and merge back against that branch.

- **DO NOT** checkin `dist` in the commits.

- It's OK to have multiple small commits as you work on the PR - GitHub will automatically squash it before merging.

- If adding a new feature:

  - Add accompanying test case.
  - Provide a convincing reason to add this feature. Ideally, you should open a suggestion issue first and have it approved before working on it.

- If fixing bug:

  - If you are resolving a special issue, add `(fix #xxxx[,#xxxx])` (#xxxx is the issue id) in your PR title for a better release log, e.g. `update entities encoding/decoding (fix #3899)`.
  - Provide a detailed description of the bug in the PR. Live demo preferred.
  - Add appropriate test coverage if applicable.

## Development Setup

You will need [Node.js](http://nodejs.org) **version 16** and [pnpm](https://pnpm.io/).

After cloning the repo, run:

```bash
$ pnpm i # install the dependencies of the project
```

## Style Guide

The most important rule is to keep consistent,
since nothing can be uglier than a heap of inconsistent components.
Even if some rules are being broken, they should be broken consistently.

Generally, the styles are specified in [the editorconfig](.editorconfig)
and [prettier](icalingua/.prettierrc.js).  
Please follow them to keep the styles of the project unified
and make following contributions easier. >\_<  
You should run prettier before every commit to [icalingua](icalingua), like this:

```bash
pnpm prettier -m .
```

However, in order to avoid ugly spaces before too deeply-nested code,
or to align, the indent rules can sometimes be broken,
but please be cautious before doing so.
If you are not sure what will happen if you run prettier, you can preview it using the
command follow:

```bash
pnpm prettier -c .
```

And please keep the lines within a moderate length and indent level.
If some code are inevitably nested too deeply,
please consider putting them into another file.
And though splitting some elements (e.g. attributes of a HTML tag) do be a good style,
putting them together in a single line may be increasing the readability ---
and the latter is encouraged.

**'can be put into a single line' means 'a single line of moderate length',
i.e. don't put everything into a single line like an OIer or an uglier.**

### Vue Templates

If an opening tag and its closing tag can be put into a single line, do so;
otherwise, leave the tags alone in their lines.

Don't split the opening tag into multiple lines if it can be written in a single line,
because in this case both styles are easy to read for the single tag,
and in the ocean of tags, being compact can make the DOM tree's structure clearer.

An opening or self-closing tag split into multiple lines
should have its right angle bracket(`>`) written in a single line.
For single-lined opening tags, there should always be no spaces before `>`;
and for single-lined self-closing tags, there should always be exactly one space before `/>`.
The closing bracket should be indented the same as the opening bracket.

Attribute values should always be surrounded by quotes.
If the value is wrapped, put the quote in a single line (i.e. NOT in the same line as `>` or `/>`)
with one level indented than the attribute name if possible.

### JS, TS, and so on

Opening curly braces do not have a line break prepended.

Add spaces around binary or trinary operators and arrows,
after commas and colons, and after semicolons in `for` statements.
When a line is so complex that it appears better not to add spaces, split the statement.
