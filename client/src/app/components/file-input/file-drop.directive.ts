import { Directive, ElementRef, HostBinding, HostListener, inject, output } from '@angular/core';

@Directive({
    selector: '[appFileDrop]',
})
export class FileDropDirective {
    fileDrop = output<FileList>();
    hostElement = inject(ElementRef);
    hostElementRect: DOMRect | undefined = undefined;

    ngAfterViewInit(): void {
        this.hostElementRect =
            this.hostElement.nativeElement.getBoundingClientRect();
    }

    @HostBinding('style.background-color') hostBackgroundColor!: string;
    @HostBinding('style.color') hostColor!: string;

    @HostListener('dragover', ['$event']) onDragOver(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();

        this.hostBackgroundColor = 'var(--mat-sys-primary)';
        this.hostColor = 'var(--mat-sys-on-primary)';
    }

    @HostListener('dragleave', ['$event']) onDragLeave(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();

        this.hostElementRect =
            this.hostElement.nativeElement.getBoundingClientRect();

        if (
            event.clientX < this.hostElementRect!.left ||
            event.clientX > this.hostElementRect!.right ||
            event.clientY < this.hostElementRect!.top ||
            event.clientY > this.hostElementRect!.bottom
        ) {
            this.hostBackgroundColor = '';
            this.hostColor = '';
        }
    }

    @HostListener('drop', ['$event']) onDrop(event: DragEvent) {
        event.preventDefault();
        event.stopPropagation();

        this.hostBackgroundColor = '';
        this.hostColor = '';

        let files = event.dataTransfer?.files;

        if (!files) {
            return;
        } else {
            this.fileDrop.emit(files);
        }
    }
}
