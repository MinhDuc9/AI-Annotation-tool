import { ChangeDetectionStrategy, Component, EventEmitter, HostListener, input, OnInit, output, Signal, signal, WritableSignal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';import { FileDropDirective } from './file-drop.directive';
import { MatCardModule } from '@angular/material/card';
import { DecimalPipe } from '@angular/common';
;

export enum IncorrectFileInput{
  IncorrectExtension,
  MultipleFiles,
  None
}

@Component({
  selector: 'app-file-input',
  imports: [MatInputModule, MatButtonModule, MatIconModule, FileDropDirective, MatCardModule, DecimalPipe],
  templateUrl: './file-input.component.html',
  styleUrl: './file-input.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FileInputComponent implements OnInit {

  IncorrectFileInput = IncorrectFileInput

  allowedTypes = input<string>('');
  allowMultipleFiles = input<boolean>(false);

  onfileUploaded = output<FileList>()
  onfileRemoved = output<number>()
  uploadedFiles: File[] = []

  allowedTypesList: string[] = []

  label = input("")
  incorrectInput = signal(IncorrectFileInput.None)


  ngOnInit() {
    this.allowedTypesList = this.allowedTypes().replace(/,/g, ', ').split(/,\s*/);
  }

  fileInserted(event: any) {
    if (event?.target?.files.length === 0) {
      return;
    }else{
      this.uploadFile(event.target.files);
    }
    
  }

  removeFile(index: number) {
    if (this.uploadedFiles.length > 0){
      this.onfileRemoved.emit(index);
      this.uploadedFiles.splice(index, 1);
    }
  }

  uploadFile(files: FileList) {
    this.incorrectInput.set(IncorrectFileInput.None)

    if (!this.allowMultipleFiles() && files.length > 1) {
      this.incorrectInput.set(IncorrectFileInput.MultipleFiles)
      return
    }

    Array.from(files).forEach(file => {
      let extension = file.name.substring(file.name.lastIndexOf('.'))
      console.log(extension)
      console.log(this.allowedTypesList)

      if (this.allowedTypesList.length > 0 && !this.allowedTypesList.includes(extension ?? '')) {
        this.incorrectInput.set(IncorrectFileInput.IncorrectExtension)
        return
      }
    })

    if (this.incorrectInput() === IncorrectFileInput.None) {
      this.uploadedFiles.push(...Array.from(files));
      this.onfileUploaded.emit(files);
    }
  }
}
