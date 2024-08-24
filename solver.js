class Puzzle {
    constructor(puzzleSpec) {
        // [1] are the column specs, [0] are the row specs
        this.cells = Array(puzzleSpec[1].length).fill().map((_, r) => Array(puzzleSpec[0].length).fill().map((_, c) => new Cell(r, c)));
        this.init(puzzleSpec[1], puzzleSpec[0]);
        this.engageMode = "Speelmodus";
    }

    init(rowSpecs, colSpecs) {
        this.rows = [];
        this.cols = [];

        // both arrays of arrays with numbers should amount to the same total
        const colsTotal = colSpecs.reduce((a, b) => a + b.reduce((c, d) => c + d, 0), 0);
        const rowsTotal = rowSpecs.reduce((a, b) => a + b.reduce((c, d) => c + d, 0), 0);
        if (colsTotal !== rowsTotal) {
            throw `Invalid puzzle: colsTotal (${colsTotal}) !== rowsTotal (${rowsTotal})`;
        }

        for (let i = 0; i < rowSpecs.length; i++) {
            this.rows.push(new RowCol(rowSpecs[i], this.cells[i]));
        }
        for (let i = 0; i < colSpecs.length; i++) {
            this.cols.push(new RowCol(colSpecs[i], this.cells.map(row => row[i])));
        }
    }

    resetSolveState() {
        this.cells.forEach(row => row.forEach(cell => cell.value = 0));
        this.initialStage = true;

        this._smartSolveState();

        this.steps = [];
    }

    _smartSolveState() {
        const modeUncertainty = {};
        ["rows", "cols"].forEach(mode => {
            const rowcols = this[mode];
            const uncertainties = rowcols.map((rowcol, i) => {
                // sum the specs of rowcol
                return {
                    index: i,
                    uncertainty: rowcol.cells.length - (rowcol.specs.reduce((a, b) => a + b, 0) + rowcol.specs.length - 1)
                };
            }).sort((a, b) => a.uncertainty - b.uncertainty);
            modeUncertainty[mode] = uncertainties;
        }, this);
        const minRowUncertainty = Math.min(...modeUncertainty.rows.map(u => u.uncertainty));
        const minColUncertainty = Math.min(...modeUncertainty.cols.map(u => u.uncertainty));
        const rowPersue = modeUncertainty.rows.filter(u => this.rows[u.index].specs.some(n => n > u.uncertainty), this).map(u => u.index);
        const colPersue = modeUncertainty.cols.filter(u => this.cols[u.index].specs.some(n => n > u.uncertainty), this).map(u => u.index);
        if (minRowUncertainty <= minColUncertainty) {
            this.mode = "rows";
            this.indices = rowPersue;
            this.followUpIndices = new Set(colPersue);
        } else {
            this.mode = "cols";
            this.indices = colPersue;
            this.followUpIndices = new Set(rowPersue);
        }

    }

    solve() {
        
        while (this.indices.length) {
            this.stepSolve();
        }
        if (!this.finished()) {
            throw "More than one solution possible?";
        }

    }

    rollbackStep() {
        if (this.steps.length === 0) {
            return;
        }
        const step = this.steps.pop();
        const rowcol = step.orientation === "rows" ? this.rows[step.index] : this.cols[step.index];
        step.indicesFixed.forEach(i => rowcol.cells[i].value = 0);
        this.mode = step.orientation;
        this.indices.unshift(step.index);
        this.followUpIndices = step.followUpIndices;
    }

    stepSolve(hintMode=false) {

            let indicesFixed = [];
            while (indicesFixed.length === 0) {

                if (this.indices.length === 0 && !this.finished()) {
                    throw "Unsolvable: not enough info, muliple solutions exist";
                }

                var index = this.indices.shift();
                var rowcol = this.mode === "rows" ? this.rows[index] : this.cols[index];

                indicesFixed = rowcol.solve(hintMode);

                if (indicesFixed.length) {
                    if (hintMode) {
                        this.indices.unshift(index);
                        return {
                            orientation: this.mode,
                            index: index,
                        };
                    }
                    this.steps.push(new Step(this.mode, index, indicesFixed, new Set([...this.followUpIndices])));
                }
                indicesFixed.forEach(i => this.followUpIndices.add(i));

                if (this.indices.length === 0) {
                    if (this.initialStage) {
                        this.initialStage = false;
                        this.indices.splice(0, 0, ...this.cols.map((_, i) => i));
                    } else {
                        const sortedIndices = [...this.followUpIndices].sort((a, b) => a - b);
                        this.indices.splice(0, 0, ...sortedIndices);
                    }
                    this.followUpIndices.clear();
                    this.mode = this.mode === "cols" ? "rows" : "cols";
                }

        }
        return null;

    }

    finished() {
        return this.cells.every(row => row.every(cell => cell.value !== 0));
    }

}

class RowCol {
    constructor(specs, cells) {
        this.updateSpecs(specs);
        this.cells = cells;
        this._resetGrid();
    }

    _resetGrid() {
        this._alignmentsCache = Array(this.hmm.states.length).fill().map(() => Array(this.cells.length).fill());
    }

    updateSpecs(specs) {
        this.hmm = new HMM(specs);
        this.specs = specs;        
    }

    solve(hintsMode=false) {
        const alignments = this.findAlignments(this.cells.length - 1, this.hmm.states.length - 1, this.hmm.states[this.hmm.states.length - 1].minlen);
        this._resetGrid();
        if (alignments.length === 0)
            throw "No solution possible?";
        const foundIndices = [];
        alignments[0].forEach((value, idx) => {
            if (alignments.slice(0).every(align => align[idx] === value) && this.cells[idx].value === 0) {
                if (!hintsMode)
                    this.cells[idx].value = value;
                foundIndices.push(idx);
            }
        });
        return foundIndices;
    }

    findAlignments(cellIdx, stateIdx, stateLen) {
        if (stateIdx === 0 && cellIdx === -1) {
            return [ [] ];
        }
        if (stateIdx === -1 || cellIdx === -1 && (stateIdx > 1 || stateLen > 0)) {
            return [];
        }

        if (this.hmm.states[stateIdx].minlen === stateLen && cellIdx >= 0 && this._alignmentsCache[stateIdx][cellIdx]) {
            return this._alignmentsCache[stateIdx][cellIdx];
        }

        const alignments = [];
        if (this.hmm.states[stateIdx].isSet) {
            if (stateLen > 0 && [0, 1].includes(this.cells[cellIdx].value)) {
                this.findAlignments(cellIdx - 1, stateIdx, stateLen - 1).forEach(align => {
                    alignments.push(align.concat([1]));
                });
            }
            else if (stateLen === 0 && stateIdx > 0) {
                const len = this.hmm.states[stateIdx - 1].minlen;
                this.findAlignments(cellIdx, stateIdx - 1, len).forEach(align => {
                    alignments.push(align);
                });
            }
        } else {
            if ([0, -1].includes(this.cells[cellIdx].value)) {
                this.findAlignments(cellIdx - 1, stateIdx, 0).forEach(align => {
                    alignments.push(align.concat([-1]));
                });
            }
            if (stateLen === 0 && stateIdx > 0) {
                const len = this.hmm.states[stateIdx - 1].minlen;
                this.findAlignments(cellIdx, stateIdx - 1, len).forEach(align => {
                    alignments.push(align);
                });
            }
        }

        if (this.hmm.states[stateIdx].minlen === stateLen && cellIdx >= 0) {
            this._alignmentsCache[stateIdx][cellIdx] = alignments.map(align => align.slice(0));
        }

        return alignments;
    }
}

class HMM {
    constructor(specs) {
        this.states = [ new HMMState(0, false) ];
        specs.forEach(element => {
            this.states.push(new HMMState(element, true));
            this.states.push(new HMMState(1, false));
        });
        this.states[this.states.length - 1].minlen = 0;
    }
}

class HMMState {
    constructor(minlen, isSet) {
        this.minlen = minlen;
        this.isSet = isSet;
    }
}

class Cell {
  constructor(y, x) {
    this.y = y;
    this.x = x;
    this.value = 0;  // possible values: 0, 1, -1
  }
}

class Step {
    constructor(orientation, index, indicesFixed, followUpIndices) {
        this.orientation = orientation;
        this.index = index;
        this.indicesFixed = indicesFixed;
        this.followUpIndices = followUpIndices;
    }
}
