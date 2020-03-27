
Data-driven web components in pure JavaScript.

## Overview

Better [check out the demo](http://luapower.com/x-widgets-demo.html)
before anything, which also includes some quick-reference documentation.

This library is designed for data-dense business-type apps with a focus
on data entry and data navigation.

Such apps need higher information density, higher signal-to-noise ratio,
faster loading times and lower operational latencies than the usual
consumer-centric web-apps, and as such, tend to favor tabbed and split-pane
layouts over newspaper-type layouts, optimize for keyboard navigation,
and are generally designed for an office setting with a big screen, a chair
and a keyboard and mouse ("keyboard & mouse"-first apps).

So what this means is: none of that responsive stuff, keyboard is king,
no touchy the screen, and no megabytes of polyfills to implement half a
browser because you want to squeeze that last drop of the market or deliver
a few more ads.

## Browser Compatibility

This will probably only work on desktop Firefox and Chrome/Edge for the
forseeable future. Something might be done for Safari and maybe mobile
Chrome and Firefox too. Anything else is out.

## Installation

Look, it's just a bunch of .css and .js files. Load them as they are or
combine, minify and gzip them, you know, do what you have to do, make it
look professional.

The dependencies are `glue.js` and `divs.js` from [webb] so get those first.
Get `rowset.js` too if you want to use the widgets in data-driven mode.
`glue.js` extends JavaScript with basic routines similar to [glue] from Lua.
`divs.js` is a tiny jQuery-like library for DOM manipulation.
`rowset.js` contains the client-side row-set abstraction that makes the
widgets data-driven.

## Styling

Even though they're web components, the widgets don't use shadow DOMs so
both their sub-elements and their styling are up for grabs. All widgets
get the `.x-widget` class that you can set global styling like a custom
font to, without disturbing your other styles.

## Web developers beware

If you're a web developer (as opposed to say, a programmer), you might want
to stay away from this library. This library's author doesn't have much
respect for "design patterns", "best practices", "code smells" and other
such _thinking-avoidance mechanisms_ often employed by web developers.
If you're still not sure, here's a list to
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

