# Svelte Input Component

Started playing with `Svelte` and this is my first attempt to create re-usable component ... no one said that it will be useful :)

![screenshot](https://github.com/countnazgul/svelte-input/raw/master/images/screenshot.png)

### Instalation

```
npm install svelte-custom-input
````

### Properties
* `value` - the text value to be displayed 
* `showPlaceholder` - (default `true`) show/hide placeholder
* `placeholder` - (default `PLACEHOLDER`) the text for the placeholder
* `disabled` - (default `false`) enable/disable the input

### Usage

Somewhere is your `Svelte` code:
```javascript
import svInput from 'svelte-custom-input'

let inputText = 'My input value'
let placeholder = 'Placeholder text'

```

And in the `html` part:

```html
<svInput 
    bind:value={inputText} 
    showPlaceholder={true} 
    placeholder={placeholder} 
    disabled={false} 
/>
```

