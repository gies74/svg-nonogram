var g, drawContext;
var rects = [];
var labels = [];
var buttons = [];
var canvas;
const offset = 180;
const cellSize = 20;
const buttonWidth = 110;
const buttonHeight = 30;
const actions = ["Speelmodus", "Geef hint", "Zet oplosstap", "Stap terug", "Los op"];

var puzzle;

SVG.on(document, 'DOMContentLoaded', async function() {
    canvas = SVG().addTo('#body');
    var select = document.getElementById("puzzleSelect");
    Object.keys(puzzles).forEach(key => {
        var option = document.createElement("option");
        option.text = key;
        select.add(option);
    });
    loadPuzzle();
});

const loadPuzzle = () => {
    const select = document.getElementById("puzzleSelect");
    const puzzleName = select.options[select.selectedIndex].text;
    puzzle = new Puzzle(puzzles[puzzleName]);
    _loadPuzzle();
}

const _loadPuzzle = () => {
    const width = Math.max(offset + (puzzle.cols.length + 1) * cellSize, actions.length * buttonWidth + cellSize);
    canvas.size(width, offset + (puzzle.rows.length + 2) * cellSize + buttonHeight);
    drawAll();
    resetPuzzle();
}

const drawAll = () => {
    drawPuzzle();
    drawToolbar(actions);
}

const drawPuzzle = () => {
    rects.splice(0, rects.length);
    labels.splice(0, labels.length);

    canvas.clear();
    const grid = canvas.group();
    grid.stroke({ linecap: 'round', color: '#000' });
    grid.fill('none');


    puzzle.rows.forEach((_,ri) => {
        const y0 = offset + ri * cellSize;
        puzzle.cols.forEach((_,ci) => {
            const x0 = offset + ci * cellSize;
            const puzzleCell = puzzle.cells[ri][ci];
            const color = puzzleCell.value === 0 ? '#fff' : puzzleCell.value === 1 ? '#555' : '#ddd';
            const rect = grid.rect(cellSize, cellSize).move(x0, y0).attr({ fill: color }).stroke({ width: 0 });
            rect["data"] = puzzleCell;
            rects.push(rect.click(onCellClick));
        });
    });

    [puzzle.rows.length + 1, puzzle.cols.length + 1].forEach(n=> {
        Array(n).fill().forEach((_, j) => {
            const strokeWidth = j % 5 == 0 ? 2 : .5;
            let i = offset + j * cellSize;
            grid.line(i, 0, i, offset + puzzle.rows.length * cellSize).stroke({ width: strokeWidth });
            grid.line(0, i, offset + puzzle.cols.length * cellSize, i).stroke({ width: strokeWidth });
        });
    });

    puzzle.rows.forEach((row, i) => {
        const label = grid.text(row.specs.join(" ")).move(0, offset + i * cellSize + 3);
        labels.push(label);
    });
    puzzle.cols.forEach((col, i) => {
        var text = col.specs.join("\n");
        const label = grid.text(text).leading(1).move(offset + i * cellSize + 3, 0);
        labels.push(label);
    });

    return grid;
}


const drawToolbar = (actions) => {
    buttons.splice(0, buttons.length);
    const toolbar = canvas.group();
    toolbar.stroke({ linecap: 'round', color: '#000' });
    toolbar.fill('none');

    actions.forEach((action, i) => {
        const x0 = offset + i * buttonWidth;
        const button = toolbar.group();
        button.rect(buttonWidth, buttonHeight).move(x0, 0).attr({ fill: '#fff' }).stroke({ width: 1 });
        button.text(action).move(x0 + 10, 10);
        button["data-enabled"] = true;
        button.click((event) => {
            const button = event.target.instance.parents()[1];
            if (!button["data-enabled"]) {
                reportText("Deze actie is niet beschikbaar in de huidige modus");
                return;
            }
            executeAction(action, button);
        });
        buttons.push(button);
    });
    toolbar.move(0, offset + (puzzle.rows.length + 1) * cellSize);

    return toolbar;
};

const executeAction = async (action, button) => {
    mode = puzzle.engageMode;
    switch (action) {
        case "Speelmodus":
            mode = mode === "Bewerkmodus" ? "Speelmodus" : "Bewerkmodus";
            puzzle.engageMode = mode;
            button.children()[1].text(mode);
            buttons.slice(4).forEach(b => {
                b.children()[0].attr({ fill: mode === "Speelmodus" ? '#fff' : '#ddd' })
                b["data-enabled"] = mode === "Speelmodus";
            });

            if (mode === "Speelmodus") {
                resetPuzzle();
            } else {
                solvePuzzle();
            }
            const b2Text = mode === "Speelmodus" ? actions[1] : "Laad specs";
            buttons[1].children()[1].text(b2Text);
            const b3Text = mode === "Speelmodus" ? actions[2] : "Scratch BxH";
            buttons[2].children()[1].text(b3Text);
            const b4Text = mode === "Speelmodus" ? actions[3] : "Inverteren";
            buttons[3].children()[1].text(b4Text);

            break;
            case "Geef hint":
                if (mode === "Speelmodus")
                    await getHint();
                else
                    loadPuzzleSpecs();
                break;
            case "Zet oplosstap":
                if (mode === "Speelmodus")
                    await wrapTimedOperation(solve1Step);
                else
                    scratchNxM();
                break;
            case "Stap terug":
                if (mode === "Speelmodus")
                    rollback1Step();
                else
                    inversePuzzle();
                break;
            case "Los op":
                await wrapTimedOperation(solvePuzzle);
                reportText(`Steps needed ${puzzle.steps.length}`, append=true);
            break;
    }
}

const inversePuzzle = () => {
    puzzle.cells.forEach(row => row.forEach(cell => {
        cell.value = cell.value === 1 ? -1 : 1;
    }));
    updateAllSpecs();
    refreshDisplay();
}

const scratchNxM = () => {
    const specs = document.getElementById("output").value;
    const pattern = /^\d+x\d+$/;
    if (!pattern.test(specs)) {
        alert("Geef een B(reedte)xH(oogte) formaat op. Bijvoorbeeld 15x10");
        return;
    }
    const [b, h] = specs.split("x").map(Number);
    const rows = Array(h).fill().map(() => [b]);
    const cols = Array(b).fill().map(() => [h]);
    puzzle = new Puzzle([ cols, rows ]);
    _loadPuzzle();
};

const loadPuzzleSpecs = () => {
    const specs = document.getElementById("output").value;
    try {
        puzzle = new Puzzle(JSON.parse(specs));
    } catch (e) {
        alert(e);
        return;
    }
    _loadPuzzle();
};

const onCellClick = (event) => {
    const rect = event.target.instance;
    const cell = rect["data"];
    if (puzzle.engageMode === "Speelmodus") {
        cell.value = cell.value === 0 ? 1 : cell.value === 1 ? -1 : 0;
        updateSolveState(cell);
    } else {
        cell.value = cell.value === 1 ? -1 : 1;
        updateSpecs(cell);
    }
    rect.attr({ fill: cell.value === 0 ? '#fff' : cell.value === 1 ? '#555' : '#ddd' });
};

const updateSolveState = (cell) => {
    const index = puzzle.mode === "rows" ? cell.y : cell.x;
    const followUpIndex = puzzle.mode === "rows" ? cell.x : cell.y;

    if (!puzzle.indices.includes(index)) {
        puzzle.indices.push(index);
    }
    puzzle.followUpIndices.add(followUpIndex);

}

const updateAllSpecs = () => {
    puzzle.cells.forEach(row => row.forEach(cell => {
        updateSpecs(cell);
    }));
}

const updateSpecs = (cell) => {
    // use the cell's x and y property

    var counts = [puzzle.rows[cell.y], puzzle.cols[cell.x]].map(rowcol => {
    // get row's consecutive set cell counts
        return rowcol.cells.reduce((acc, cell) => {
                if (cell.value === 1) {
                    if (acc.prevCellSet) {
                        acc.counts[acc.counts.length - 1]++;
                    } else {
                        acc.counts.push(1);
                    }
                }
                acc.prevCellSet = cell.value === 1;
                return acc;
            }, { prevCellSet: false, counts: [] });
    }).map(rowcol => rowcol.counts);

    labels[cell.y].text(counts[0].join(" "));
    labels[cell.x + puzzle.rows.length].text(counts[1].join("\n"));

    puzzle.rows[cell.y].updateSpecs(counts[0]);
    puzzle.cols[cell.x].updateSpecs(counts[1]);

    reportText(JSON.stringify([puzzle.cols.map(col => col.specs), puzzle.rows.map(row => row.specs)]));

}

const reportText = (text, append=false) => {
    const report = document.getElementById("output");
    if (!append) {
        report.value = "";
    }
    report.value += text + "\n";
}

const resetPuzzle = () => {
    puzzle.resetSolveState();
    refreshDisplay();
}

const refreshDisplay = () => {
    rects.forEach(rect => {
        const color = rect["data"].value === 0 ? '#fff' : rect["data"].value === 1 ? '#555' : '#ddd';
        rect.attr({ fill: color });
    });
}


const solvePuzzle = async () => {
    while (!puzzle.finished()) {
        await stepUpdate();
    }
}

const solve1Step = async () => {
    if (!puzzle.finished()) {
        await stepUpdate();
    }
}

const rollback1Step = () => {
    puzzle.rollbackStep();
    refreshDisplay();
}

const getHint = async () => {
    if (!puzzle.finished()) {
        const hint = await stepUpdate(true);
        if (hint) {
            reportText(`Hint: ${hint.orientation === "rows" ? "Rij" : "Kolom"} ${hint.index + 1}`);
            blinkLabel(hint);
        } else {
            reportText("Geen hint beschikbaar");
        }
    }
}

const blinkLabel = (hint) => {
    const label = labels[hint.orientation === "rows" ? hint.index : hint.index + puzzle.rows.length];
    label.animate(600).stroke({'color':'#f00'}).loop(6, true).after(function() {
        label.animate(600).stroke({'color':'#000'});
    });
}

const stepUpdate = async (hintMode=false) => {
    const result = puzzle.stepSolve(hintMode);
    if (!hintMode) {
        refreshDisplay();
    }
    return result;
}

const wrapTimedOperation = async (operation) => {
    const start = performance.now();
    try {
        await operation();
    } catch (e) {
        reportText(e);
        return;
    }
    const performanceText = `Operation took ${Math.round(performance.now() - start)} ms`;
    reportText(performanceText);
}