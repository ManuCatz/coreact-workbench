import { mount } from 'svelte';
import './demo';
import { drawing, drawingStore } from './ui/store';
import { activeDrawingName, refresh } from './ui/store';
import App from './ui/App.svelte';
import './ui/app.css';

// Load the simple mono drawing as the active drawing (it was saved during the
// demo initialization in demo.ts) so the canvas starts with its content.
drawingStore.loadDrawing('SimpleMono', drawing);
activeDrawingName.set('SimpleMono');
refresh();

const target = document.getElementById('app')!;
target.innerHTML = '';
mount(App, { target });
