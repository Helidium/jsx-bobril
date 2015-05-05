# Bobril JSX

*The current version of Bobril JSX is based on version 0.12.2 of React's JSX Transformer.*

For unknown tag names, an `b()` call will always be generated. This should allow
you to use JSX if you're also using
[BobrilAdapter](https://github.com/Bobris/Bobril/blob/master/examples/jsx/app.js) to implement
custom types.

If you make use of [JSX Spread Attributes](http://facebook.github.io/react/docs/jsx-spread.html),
the resulting code will make use of `Object.assign()` to merge attributes - if
your code needs to run in environments which don't implement `Object.assign`
natively, you're responsible for ensuring it's available via a
[shim](https://github.com/ljharb/object.assign), or otherwise.

Other than that, the rest of React's JSX documentation should still apply:

* [JSX in Depth](http://facebook.github.io/react/docs/jsx-in-depth.html)
* [JSX Spread Attributes](http://facebook.github.io/react/docs/jsx-spread.html)
* [JSX Gotchas](http://facebook.github.io/react/docs/jsx-gotchas.html) - with
  the exception of `dangerouslySetInnerHTML`
* [If-Else in JSX](http://facebook.github.io/react/tips/if-else-in-JSX.html)

### Command Line Usage

```
npm install -g jsx-bobril
```

```
jsx-bobril --watch src/ build/
```

To disable precompilation from the command line, pass a `--no-precompile` flag.

Run `jsx-bobril --help` for more information.

## Related Modules

* [msx](https://github.com/insin/msx) - forked plugin.

## MIT Licensed
=======
# jsx-bobril
