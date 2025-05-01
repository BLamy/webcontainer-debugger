// DebuggerPanel.js
import { Decoration } from "@codemirror/view";

export class DebuggerPanel {
  constructor(container, debugSteps, onStepChangeCallback) {
    this.container = container;
    this.steps = debugSteps || []; // Use passed steps, default to empty array
    this.currentStep = 0;
    this.onStepChange = onStepChangeCallback; // Store the callback
    if (this.steps.length > 0) {
       this.render();
       this.setupListeners();
       this.updateDisplay(); // Initial display update including callback trigger
    } else {
       this.container.innerHTML = '<p>No debug steps available for this test.</p>';
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="wallaby-debugger">
        <div class="debugger-controls">
          <button class="btn-first" title="First Step">⏮</button>
          <button class="btn-prev" title="Previous Step">◀</button>
          <div class="step-counter">Step ${this.currentStep + 1} of ${this.steps.length}</div>
          <button class="btn-next" title="Next Step">▶</button>
          <button class="btn-last" title="Last Step">⏭</button>
        </div>
        <div class="timeline">
          <div class="timeline-track"></div>
        </div>
        <div class="variables-panel"></div>
      </div>
    `;
  }

  setupListeners() {
    this.container.querySelector('.btn-first').addEventListener('click', () => this.goToStep(0));
    this.container.querySelector('.btn-prev').addEventListener('click', () => this.goToStep(this.currentStep - 1));
    this.container.querySelector('.btn-next').addEventListener('click', () => this.goToStep(this.currentStep + 1));
    this.container.querySelector('.btn-last').addEventListener('click', () => this.goToStep(this.steps.length - 1));
  }

  goToStep(step) {
    if (step >= 0 && step < this.steps.length && step !== this.currentStep) {
      console.log(`[DebuggerPanel] Moving from step ${this.currentStep} to step ${step}`);
      this.currentStep = step;
      
      // Update UI immediately for responsiveness
      this.container.querySelector('.step-counter').textContent = 
        `Step ${this.currentStep + 1} of ${this.steps.length}`;
      
      // Update timeline points to reflect the new active step
      const timelinePoints = this.container.querySelectorAll('.timeline-point');
      timelinePoints.forEach((point, index) => {
        if (index === this.currentStep) {
          point.classList.add('active');
        } else {
          point.classList.remove('active');
        }
      });
      
      // Perform the full update
      this.updateDisplay();
    }
  }

  updateDisplay() {
    this.container.querySelector('.step-counter').textContent = `Step ${this.currentStep + 1} of ${this.steps.length}`;
    this.updateTimeline();
    this.updateVariables();

    const step = this.steps[this.currentStep];
    if (step && this.onStepChange) {
      // Ensure file path is properly normalized
      let relativePath = step.file || '';
      
      // Normalize the path - strip leading slashes, handle empty paths
      relativePath = relativePath.trim();
      if (relativePath.startsWith('/')) {
        relativePath = relativePath.substring(1);
      }
      
      // Ensure line is a valid number
      const lineNumber = step.line ? parseInt(step.line, 10) : 1;
      
      // Log the callback call for debugging
      console.log(`[DebuggerPanel] Calling onStepChange with file='${relativePath}', line=${lineNumber}`);
      
      // Call the callback with normalized path and line number
      this.onStepChange(relativePath, lineNumber);
      
      // Update status bar position
      this.updateStatusPosition(relativePath, lineNumber);
    }
  }

  updateTimeline() {
    const track = this.container.querySelector('.timeline-track');
    track.innerHTML = '';
    
    this.steps.forEach((step, index) => {
      const point = document.createElement('div');
      point.className = 'timeline-point';
      if (index === this.currentStep) {
        point.className += ' active';
      }
      point.addEventListener('click', () => this.goToStep(index));
      point.setAttribute('title', `Step ${index + 1}`);
      track.appendChild(point);
    });
  }

  updateVariables() {
    const panel = this.container.querySelector('.variables-panel');
    panel.innerHTML = '';
    
    const step = this.steps[this.currentStep];
    if (!step || !step.vars) return;
    
    // Compare with previous step to highlight changes
    const prevStep = this.currentStep > 0 ? this.steps[this.currentStep - 1] : null;
    
    Object.entries(step.vars).forEach(([name, value]) => {
      const varEl = document.createElement('div');
      varEl.className = 'variable';
      
      // Check if value changed from previous step
      let changed = false;
      if (prevStep && prevStep.vars) {
        const prevValue = prevStep.vars[name];
        changed = JSON.stringify(prevValue) !== JSON.stringify(value);
      }
      
      if (changed) {
        varEl.className += ' changed';
      }
      
      varEl.innerHTML = `
        <span class="var-name">${name}</span>
        <span class="var-value">${this.formatValue(value)}</span>
      `;
      
      panel.appendChild(varEl);
    });
  }

  updateStatusPosition(file, line) {
    const statusPosition = document.getElementById('status-position');
    if (statusPosition) {
      statusPosition.textContent = `${file}:${line}`;
    }
  }

  formatValue(value) {
    if (value === undefined) return '<span class="undefined">undefined</span>';
    if (value === null) return '<span class="null">null</span>';
    
    if (typeof value === 'object') {
      try {
        return `<span class="object">${JSON.stringify(value)}</span>`;
      } catch (e) {
        return '<span class="object">[Object]</span>';
      }
    }
    
    if (typeof value === 'boolean') {
      return `<span class="boolean">${value}</span>`;
    }
    
    if (typeof value === 'number') {
      return `<span class="number">${value}</span>`;
    }
    
    if (typeof value === 'string') {
      return `<span class="string">"${value}"</span>`;
    }
    
    return String(value);
  }
}
