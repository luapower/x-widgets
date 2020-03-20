
Data-driven web components in pure JavaScript.

## Overview

Better [check out the demo](http://luapower.com/widgets_demo.html)
before anything, which also includes some quick-reference documentation.


## Loading

Load the .css and .js files for the widgets that you need in your web app.

Everything depends on `glue.js` and `divs.js` from [webb] so load those too.
Load `rowset.js` too if you want to use the widgets in data-driven mode.

`glue.js` extends JavaScript with basic routines similar to [glue] from Lua.
`divs.js` is a tiny jQuery-like library for DOM manipulation.
`rowset.js` contains the client-side row-set abstraction that makes the
widgets data-driven.

## Data-driven widgets


## Web developers beware

If you're a web developer (as opposed to say, a programmer), you might want
to stay away from this library. This library's author doesn't have much
respect for "design patterns", "best practices" and other such
_thinking-avoidance mechanisms_ (yeah, you heard right) often employed by
web developers. If you're still not sure, here's a list to
<s>test the limits of your dogmatism</s> see how unprofessional I am:

* this lib pollutes the global namespace like it's London 1858.
* this lib even extends built-in classes with new methods.
* this lib only uses `===` when it's actually necessary.
* this lib uses `<table>` for layouting. are you sick yet?
* this lib uses snake case instead of your precious hungarian notation.
* this lib does not even quote html attributes. why are you still reading?
* this lib uses a "deployment system" whereby you open up your file explorer,
and then you copy-paste a bunch of .css and .js files to your goddam www folder.

