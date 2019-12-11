(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
    typeof define === 'function' && define.amd ? define(factory) :
    (global = global || self, global.CustomInput = factory());
}(this, (function () { 'use strict';

    function noop() { }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function element(name) {
        return document.createElement(name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_data(text, data) {
        data = '' + data;
        if (text.data !== data)
            text.data = data;
    }
    function set_input_value(input, value) {
        if (value != null || input.value) {
            input.value = value;
        }
    }
    function set_style(node, key, value, important) {
        node.style.setProperty(key, value, important ? 'important' : '');
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function flush() {
        const seen_callbacks = new Set();
        do {
            // first, call beforeUpdate functions
            // and update components
            while (dirty_components.length) {
                const component = dirty_components.shift();
                set_current_component(component);
                update(component.$$);
            }
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    callback();
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            $$.fragment && $$.fragment.p($$.ctx, $$.dirty);
            $$.dirty = [-1];
            $$.after_update.forEach(add_render_callback);
        }
    }
    const outroing = new Set();
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, value = ret) => {
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(children(options.target));
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    /* src\index.svelte generated by Svelte v3.16.4 */

    function add_css() {
    	var style = element("style");
    	style.id = "svelte-ydqsn9-style";
    	style.textContent = ".q-input.svelte-ydqsn9{display:grid}.title.svelte-ydqsn9{font-size:10px;opacity:0.5;padding-left:5px;justify-self:left}.field.svelte-ydqsn9{--uiFieldPlaceholderColor:var(--fieldPlaceholderColor, #767676)}.field__input.svelte-ydqsn9{background-color:transparent;border-radius:0;border:none;-webkit-appearance:none;-moz-appearance:none;font-family:inherit;font-size:1em}.field__input.svelte-ydqsn9:focus::-webkit-input-placeholder{color:var(--uiFieldPlaceholderColor)}.field__input.svelte-ydqsn9:focus::-moz-placeholder{color:var(--uiFieldPlaceholderColor);opacity:1}.a-field.svelte-ydqsn9{display:inline-block}.a-field__input.svelte-ydqsn9{display:block;box-sizing:border-box;width:100%}.a-field__input.svelte-ydqsn9:focus{outline:none}.a-field.svelte-ydqsn9{--uiFieldHeight:var(--fieldHeight, 25px);--uiFieldBorderWidth:var(--fieldBorderWidth, 2px);--uiFieldBorderColor:var(--fieldBorderColor);--uiFieldFontSize:var(--fieldFontSize, 1em);--uiFieldHintFontSize:var(--fieldHintFontSize, 1em);--uiFieldPaddingRight:var(--fieldPaddingRight, 15px);--uiFieldPaddingBottom:var(--fieldPaddingBottom, 15px);--uiFieldPaddingLeft:var(--fieldPaddingLeft, 15px);position:relative;box-sizing:border-box;font-size:var(--uiFieldFontSize)}.a-field__input.svelte-ydqsn9{height:var(--uiFieldHeight);padding:0 var(--uiFieldPaddingRight) 0 var(--uiFieldPaddingLeft);border-bottom:var(--uiFieldBorderWidth) solid var(--uiFieldBorderColor)}.a-field_a1.svelte-ydqsn9 .a-field__input.svelte-ydqsn9{transition:border-color 0.2s ease-out;will-change:border-color}.a-field_a1.svelte-ydqsn9 .a-field__input.svelte-ydqsn9:focus{border-color:var(--fieldBorderColorActive)}.field.svelte-ydqsn9{--fieldBorderColor:#d1c4e9;--fieldBorderColorActive:#673ab7}";
    	append(document.head, style);
    }

    // (106:2) {#if showPlaceholder}
    function create_if_block(ctx) {
    	let span;
    	let t;

    	return {
    		c() {
    			span = element("span");
    			t = text(/*placeholder*/ ctx[1]);
    			attr(span, "class", "title svelte-ydqsn9");
    		},
    		m(target, anchor) {
    			insert(target, span, anchor);
    			append(span, t);
    		},
    		p(ctx, dirty) {
    			if (dirty[0] & /*placeholder*/ 2) set_data(t, /*placeholder*/ ctx[1]);
    		},
    		d(detaching) {
    			if (detaching) detach(span);
    		}
    	};
    }

    function create_fragment(ctx) {
    	let div;
    	let t;
    	let label;
    	let input;
    	let dispose;
    	let if_block = /*showPlaceholder*/ ctx[3] && create_if_block(ctx);

    	return {
    		c() {
    			div = element("div");
    			if (if_block) if_block.c();
    			t = space();
    			label = element("label");
    			input = element("input");
    			attr(input, "class", "field__input a-field__input svelte-ydqsn9");
    			input.disabled = /*disabled*/ ctx[2];
    			attr(label, "class", "field a-field a-field_a1 svelte-ydqsn9");
    			attr(div, "class", "q-input svelte-ydqsn9");
    			set_style(div, "grid-template-rows", /*placeholderStyle*/ ctx[4]);
    			dispose = listen(input, "input", /*input_input_handler*/ ctx[5]);
    		},
    		m(target, anchor) {
    			insert(target, div, anchor);
    			if (if_block) if_block.m(div, null);
    			append(div, t);
    			append(div, label);
    			append(label, input);
    			set_input_value(input, /*value*/ ctx[0]);
    		},
    		p(ctx, dirty) {
    			if (/*showPlaceholder*/ ctx[3]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					if_block.m(div, t);
    				}
    			} else if (if_block) {
    				if_block.d(1);
    				if_block = null;
    			}

    			if (dirty[0] & /*disabled*/ 4) {
    				input.disabled = /*disabled*/ ctx[2];
    			}

    			if (dirty[0] & /*value*/ 1 && input.value !== /*value*/ ctx[0]) {
    				set_input_value(input, /*value*/ ctx[0]);
    			}

    			if (dirty[0] & /*placeholderStyle*/ 16) {
    				set_style(div, "grid-template-rows", /*placeholderStyle*/ ctx[4]);
    			}
    		},
    		i: noop,
    		o: noop,
    		d(detaching) {
    			if (detaching) detach(div);
    			if (if_block) if_block.d();
    			dispose();
    		}
    	};
    }

    function instance($$self, $$props, $$invalidate) {
    	let { placeholder = "PLACEHOLDER" } = $$props;
    	let { value = "" } = $$props;
    	let { disabled = false } = $$props;
    	let { showPlaceholder = true } = $$props;
    	let placeholderStyle = "";

    	if (!showPlaceholder) {
    		placeholderStyle = "0px auto";
    	} else {
    		placeholderStyle = "15px auto";
    	}

    	function input_input_handler() {
    		value = this.value;
    		$$invalidate(0, value);
    	}

    	$$self.$set = $$props => {
    		if ("placeholder" in $$props) $$invalidate(1, placeholder = $$props.placeholder);
    		if ("value" in $$props) $$invalidate(0, value = $$props.value);
    		if ("disabled" in $$props) $$invalidate(2, disabled = $$props.disabled);
    		if ("showPlaceholder" in $$props) $$invalidate(3, showPlaceholder = $$props.showPlaceholder);
    	};

    	return [
    		value,
    		placeholder,
    		disabled,
    		showPlaceholder,
    		placeholderStyle,
    		input_input_handler
    	];
    }

    class Src extends SvelteComponent {
    	constructor(options) {
    		super();
    		if (!document.getElementById("svelte-ydqsn9-style")) add_css();

    		init(this, options, instance, create_fragment, safe_not_equal, {
    			placeholder: 1,
    			value: 0,
    			disabled: 2,
    			showPlaceholder: 3
    		});
    	}
    }

    return Src;

})));
