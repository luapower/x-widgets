
Data-driven web components in pure JavaScript.

## Overview

Better [check out the demo](http://luapower.com/widgets_demo.html)
before anything, which also includes some quick-reference documentation.

This library is designed for data-centric business-type apps with a focus
on data entry and data navigation. It's designed for increased productivity
on these tasks in an office setting with a big screen and a keyboard and
mouse. ("keyboard & mouse"-first apps).

## Loading

Load the .css and .js files for the widgets that you need in your web app.

Everything depends on `glue.js` and `divs.js` from [webb] so load those first.
Load `rowset.js` too if you want to use the widgets in data-driven mode.

`glue.js` extends JavaScript with basic routines similar to [glue] from Lua.
`divs.js` is a tiny jQuery-like library for DOM manipulation.
`rowset.js` contains the client-side row-set abstraction that makes the
widgets data-driven.

## Styling

Even though they're web components, the widgets don't use shadow DOMs so
both their sub-elements and their styling are up for grabs. All widgets
have the `.x-widget` class that you can set global styling like a custom
font to.

## Web developers beware

If you're a web developer (as opposed to say, a programmer), you might want
to stay away from this library. This library's author doesn't have much
respect for "design patterns", "best practices" and other such
_thinking-avoidance mechanisms_ (yeah, you heard right) often employed by
web developers. If you're still not sure, here's a list to
<s>test the limits of your dogmatism</s> see how unprofessional I am:

* this lib pollutes the global namespace like it's London 1858.
* this lib extends built-in classes with new methods.
* this lib only uses `===` when it's actually necessary.
* this lib uses `<table>` for layouting. are you sick yet?
* this lib uses snake case instead of hungarian notation.
* this lib wraps instantation with `new` into plain functions.
* this lib does not even quote html attributes. why are you still reading?
* this lib uses a deployment system whereby you open up your file explorer
and then you copy-paste a bunch of .css and .js files to your goddam www folder.
* look, it's not even a framework, it's a library. don't you wanna use a framework?

