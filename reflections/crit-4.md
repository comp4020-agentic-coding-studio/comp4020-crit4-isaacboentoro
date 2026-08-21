# Crit 4 — an instrument

## What was the breakthrough that moved the work forward?

Realising the hardest-sounding line in the spec was the most checkable one. "No
way to play it wrong" reads like something only a tutor at a crit can judge, but
for an instrument it is a claim about which pitches exist. Once I saw that, the
scale moved into a pure module with no `AudioContext` in it and a test could
walk every printable character and prove the claim. That reframing — from a
feeling about the design to a property of the code — is what turned a vague
brief into something I could build against.

The second one was smaller and blunter: the page made sound while the spec test
was still red, because Astro had inlined the script and the test only reads
`.js` files in `dist/`. Working and passing were different things, and the fix
belonged in the build config, not in more code.

## What did this work change about who I want to be as a software developer?

That I should stop trusting the diff. The bug I am least proud of this week was
invisible in the code and obvious in a screenshot: mistyped letters were amber
with an underline, which reads as spell-check, in a page whose entire premise is
that nothing you type is wrong. The code was correct about what it drew and
wrong about what it meant.

I want to be the kind of developer who spends the extra minute rendering the
thing, listening to it, or handing it to someone else — and who, when a
correction lands, writes it into the harness so it holds next time instead of
living in my head.
